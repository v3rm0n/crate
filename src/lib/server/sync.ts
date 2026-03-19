import db from './db.js';
import { getLibraryPath } from './settings.js';
import { getPlayerManagedPath, getPlayer } from './players.js';
import { createLogger } from './logger.js';
import fs from 'node:fs';
import path from 'node:path';

const log = createLogger('sync');

/**
 * Create a directory and all its parents, one level at a time.
 * More robust than mkdirSync({ recursive: true }) on FAT32/vfat filesystems
 * which can fail with ENOENT on recursive mkdir through Docker bind mounts.
 */
function ensureDirSync(targetDir: string): void {
	if (fs.existsSync(targetDir)) return;

	const parent = path.dirname(targetDir);
	if (parent !== targetDir) {
		ensureDirSync(parent);
	}

	try {
		fs.mkdirSync(targetDir);
	} catch (err: unknown) {
		// EEXIST is fine — another operation may have created it
		if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'EEXIST') {
			return;
		}
		throw err;
	}
}

export interface SyncProgress {
	phase: 'copying' | 'removing' | 'complete' | 'error';
	current: number;
	total: number;
	currentFile?: string;
	error?: string;
}

type ProgressCallback = (progress: SyncProgress) => void;

/**
 * Copy tracks from the library to a specific player.
 * Accepts a player ID and an array of library track IDs.
 */
export async function copyToPlayer(
	playerId: number,
	trackIds: number[],
	onProgress?: ProgressCallback
): Promise<{ copied: number; failed: number; errors: string[] }> {
	const player = getPlayer(playerId);
	if (!player) {
		log.error('Cannot copy to player: player not found', { playerId });
		throw new Error('Player not found');
	}

	const libraryPath = getLibraryPath();
	const managedPath = getPlayerManagedPath(playerId);

	if (!managedPath) {
		log.error('Cannot copy to player: managed directory not configured', { playerId });
		throw new Error('Managed directory not configured');
	}

	log.info('Starting copy to player', { playerId, trackCount: trackIds.length, managedPath });

	const job = db.prepare("INSERT INTO jobs (type, status, total, player_id) VALUES ('sync', 'running', ?, ?)").run(trackIds.length, playerId);
	const jobId = job.lastInsertRowid;

	const getTrack = db.prepare('SELECT * FROM library_tracks WHERE id = ?');
	const insertPlayerTrack = db.prepare(`
		INSERT OR REPLACE INTO player_tracks (player_id, relative_path, library_track_id, file_size, is_orphan, synced_at)
		VALUES (?, ?, ?, ?, 0, datetime('now'))
	`);

	let copied = 0;
	let failed = 0;
	const errors: string[] = [];

	for (let i = 0; i < trackIds.length; i++) {
		const track = getTrack.get(trackIds[i]) as {
			id: number;
			relative_path: string;
			file_size: number;
		} | undefined;

		if (!track) {
			failed++;
			errors.push(`Track ID ${trackIds[i]} not found`);
			continue;
		}

		const srcPath = path.join(libraryPath, track.relative_path);
		const destPath = path.join(managedPath, track.relative_path);

		onProgress?.({
			phase: 'copying',
			current: i + 1,
			total: trackIds.length,
			currentFile: track.relative_path
		});

		try {
			// Ensure source file exists
			if (!fs.existsSync(srcPath)) {
				failed++;
				const msg = `Source file not found: ${srcPath}`;
				log.error('Source file missing during copy', { srcPath, relativePath: track.relative_path });
				errors.push(`Failed to copy ${track.relative_path}: ${msg}`);
				db.prepare('UPDATE jobs SET progress = ? WHERE id = ?').run(i + 1, jobId);
				continue;
			}

			// Ensure destination directory exists (level-by-level for FAT32 compatibility)
			const destDir = path.dirname(destPath);
			ensureDirSync(destDir);

			// Copy file
			fs.copyFileSync(srcPath, destPath);

			// Get actual copied file size
			const stat = fs.statSync(destPath);

			// Update database
			insertPlayerTrack.run(playerId, track.relative_path, track.id, stat.size);
			copied++;
		} catch (err) {
			failed++;
			const msg = err instanceof Error ? err.message : 'Unknown error';
			log.error('Failed to copy track', {
				relativePath: track.relative_path,
				srcPath,
				destPath,
				error: msg
			});
			errors.push(`Failed to copy ${track.relative_path}: ${msg}`);
		}

		db.prepare('UPDATE jobs SET progress = ? WHERE id = ?').run(i + 1, jobId);
	}

	db.prepare(
		"UPDATE jobs SET status = 'completed', progress = total, finished_at = datetime('now') WHERE id = ?"
	).run(jobId);

	log.info('Copy to player completed', { playerId, copied, failed, errors: errors.length > 0 ? errors : undefined });
	onProgress?.({ phase: 'complete', current: trackIds.length, total: trackIds.length });

	return { copied, failed, errors };
}

/**
 * Remove tracks from a specific player.
 * Accepts a player ID and an array of player track IDs.
 */
export async function removeFromPlayer(
	playerId: number,
	trackIds: number[],
	onProgress?: ProgressCallback
): Promise<{ removed: number; failed: number; errors: string[] }> {
	const player = getPlayer(playerId);
	if (!player) {
		log.error('Cannot remove from player: player not found', { playerId });
		throw new Error('Player not found');
	}

	const managedPath = getPlayerManagedPath(playerId);

	if (!managedPath) {
		log.error('Cannot remove from player: managed directory not configured', { playerId });
		throw new Error('Managed directory not configured');
	}

	log.info('Starting removal from player', { playerId, trackCount: trackIds.length, managedPath });

	const job = db.prepare("INSERT INTO jobs (type, status, total, player_id) VALUES ('sync', 'running', ?, ?)").run(trackIds.length, playerId);
	const jobId = job.lastInsertRowid;

	const getTrack = db.prepare('SELECT * FROM player_tracks WHERE id = ? AND player_id = ?');
	const deleteTrack = db.prepare('DELETE FROM player_tracks WHERE id = ? AND player_id = ?');

	let removed = 0;
	let failed = 0;
	const errors: string[] = [];

	for (let i = 0; i < trackIds.length; i++) {
		const track = getTrack.get(trackIds[i], playerId) as {
			id: number;
			relative_path: string;
		} | undefined;

		if (!track) {
			failed++;
			errors.push(`Player track ID ${trackIds[i]} not found for player ${playerId}`);
			continue;
		}

		const filePath = path.join(managedPath, track.relative_path);

		onProgress?.({
			phase: 'removing',
			current: i + 1,
			total: trackIds.length,
			currentFile: track.relative_path
		});

		try {
			if (fs.existsSync(filePath)) {
				fs.unlinkSync(filePath);

				// Clean up empty parent directories
				let dir = path.dirname(filePath);
				while (dir !== managedPath) {
					const entries = fs.readdirSync(dir);
					if (entries.length === 0) {
						fs.rmdirSync(dir);
						dir = path.dirname(dir);
					} else {
						break;
					}
				}
			}

			deleteTrack.run(track.id, playerId);
			removed++;
		} catch (err) {
			failed++;
			const msg = err instanceof Error ? err.message : 'Unknown error';
			errors.push(`Failed to remove ${track.relative_path}: ${msg}`);
		}

		db.prepare('UPDATE jobs SET progress = ? WHERE id = ?').run(i + 1, jobId);
	}

	db.prepare(
		"UPDATE jobs SET status = 'completed', progress = total, finished_at = datetime('now') WHERE id = ?"
	).run(jobId);

	log.info('Removal from player completed', { playerId, removed, failed, errors: errors.length > 0 ? errors : undefined });
	onProgress?.({ phase: 'complete', current: trackIds.length, total: trackIds.length });

	return { removed, failed, errors };
}
