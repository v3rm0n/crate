import db from './db.js';
import { getLibraryPath } from './settings.js';
import { getPlayerManagedPath, getPlayer } from './players.js';
import { createLogger } from './logger.js';
import fs from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const log = createLogger('sync');

/**
 * Create a directory and all its parents, one level at a time.
 * More robust than mkdir({ recursive: true }) on FAT32/vfat filesystems
 * which can fail with ENOENT on recursive mkdir through Docker bind mounts.
 */
async function ensureDir(targetDir: string): Promise<void> {
	try {
		await fs.access(targetDir);
		return;
	} catch {
		// directory doesn't exist
	}

	const parent = path.dirname(targetDir);
	if (parent !== targetDir) {
		await ensureDir(parent);
	}

	try {
		await fs.mkdir(targetDir);
	} catch (err: unknown) {
		// EEXIST is fine — another operation may have created it
		if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'EEXIST') {
			return;
		}
		throw err;
	}
}

/**
 * Copy tracks from the library to a specific player.
 * Accepts a player ID and an array of library track IDs.
 * Returns the job ID immediately; the copy runs in the background.
 */
export function startCopyToPlayer(
	playerId: number,
	trackIds: number[]
): number {
	const player = getPlayer(playerId);
	if (!player) {
		log.error('Cannot copy to player: player not found', { playerId });
		throw new Error('Player not found');
	}

	const managedPath = getPlayerManagedPath(playerId);
	if (!managedPath) {
		log.error('Cannot copy to player: managed directory not configured', { playerId });
		throw new Error('Managed directory not configured');
	}

	log.info('Starting background copy to player', { playerId, trackCount: trackIds.length, managedPath });

	const job = db.prepare("INSERT INTO jobs (type, status, total, player_id) VALUES ('sync', 'running', ?, ?)").run(trackIds.length, playerId);
	const jobId = Number(job.lastInsertRowid);

	// Fire and forget — run the copy in the background
	runCopy(jobId, playerId, trackIds, managedPath).catch(err => {
		log.error('Background copy failed unexpectedly', { jobId, error: err instanceof Error ? err.message : String(err) });
	});

	return jobId;
}

async function runCopy(
	jobId: number,
	playerId: number,
	trackIds: number[],
	managedPath: string
): Promise<void> {
	const libraryPath = getLibraryPath();
	const getTrack = db.prepare('SELECT * FROM library_tracks WHERE id = ?');
	const insertPlayerTrack = db.prepare(`
		INSERT OR REPLACE INTO player_tracks (player_id, relative_path, library_track_id, file_size, is_orphan, synced_at)
		VALUES (?, ?, ?, ?, 0, datetime('now'))
	`);

	let copied = 0;
	let failed = 0;
	const errors: string[] = [];

	try {
		for (let i = 0; i < trackIds.length; i++) {
			const track = getTrack.get(trackIds[i]) as {
				id: number;
				relative_path: string;
				file_size: number;
			} | undefined;

			if (!track) {
				failed++;
				errors.push(`Track ID ${trackIds[i]} not found`);
				db.prepare('UPDATE jobs SET progress = ? WHERE id = ?').run(i + 1, jobId);
				continue;
			}

			const srcPath = path.join(libraryPath, track.relative_path);
			const destPath = path.join(managedPath, track.relative_path);

			try {
				await fs.access(srcPath);
			} catch {
				failed++;
				const msg = `Source file not found: ${srcPath}`;
				log.error('Source file missing during copy', { srcPath, relativePath: track.relative_path });
				errors.push(`Failed to copy ${track.relative_path}: ${msg}`);
				db.prepare('UPDATE jobs SET progress = ? WHERE id = ?').run(i + 1, jobId);
				continue;
			}

			try {
				const destDir = path.dirname(destPath);
				await ensureDir(destDir);
				await fs.copyFile(srcPath, destPath);
				const stat = await fs.stat(destPath);
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

		const result = JSON.stringify({ copied, failed, errors: errors.slice(0, 10) });
		db.prepare(
			"UPDATE jobs SET status = 'completed', progress = total, finished_at = datetime('now'), result = ? WHERE id = ?"
		).run(result, jobId);

		log.info('Copy to player completed', { jobId, playerId, copied, failed });
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : 'Unknown error';
		const result = JSON.stringify({ copied, failed, errors: errors.slice(0, 10) });
		db.prepare(
			"UPDATE jobs SET status = 'failed', error = ?, finished_at = datetime('now'), result = ? WHERE id = ?"
		).run(errorMsg, result, jobId);
		log.error('Copy job failed', { jobId, error: errorMsg });
	}
}

/**
 * Remove tracks from a specific player.
 * Returns the job ID immediately; the removal runs in the background.
 */
export function startRemoveFromPlayer(
	playerId: number,
	trackIds: number[]
): number {
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

	log.info('Starting background removal from player', { playerId, trackCount: trackIds.length, managedPath });

	const job = db.prepare("INSERT INTO jobs (type, status, total, player_id) VALUES ('sync', 'running', ?, ?)").run(trackIds.length, playerId);
	const jobId = Number(job.lastInsertRowid);

	// Fire and forget
	runRemove(jobId, playerId, trackIds, managedPath).catch(err => {
		log.error('Background remove failed unexpectedly', { jobId, error: err instanceof Error ? err.message : String(err) });
	});

	return jobId;
}

async function runRemove(
	jobId: number,
	playerId: number,
	trackIds: number[],
	managedPath: string
): Promise<void> {
	const getTrack = db.prepare('SELECT * FROM player_tracks WHERE id = ? AND player_id = ?');
	const deleteTrack = db.prepare('DELETE FROM player_tracks WHERE id = ? AND player_id = ?');

	let removed = 0;
	let failed = 0;
	const errors: string[] = [];

	try {
		for (let i = 0; i < trackIds.length; i++) {
			const track = getTrack.get(trackIds[i], playerId) as {
				id: number;
				relative_path: string;
			} | undefined;

			if (!track) {
				failed++;
				errors.push(`Player track ID ${trackIds[i]} not found for player ${playerId}`);
				db.prepare('UPDATE jobs SET progress = ? WHERE id = ?').run(i + 1, jobId);
				continue;
			}

			const filePath = path.join(managedPath, track.relative_path);

			try {
				try {
					await fs.access(filePath);
					await fs.unlink(filePath);

					// Clean up empty parent directories
					let dir = path.dirname(filePath);
					while (dir !== managedPath) {
						const entries = await fs.readdir(dir);
						if (entries.length === 0) {
							await fs.rmdir(dir);
							dir = path.dirname(dir);
						} else {
							break;
						}
					}
				} catch {
					// File already gone, that's fine
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

		const result = JSON.stringify({ removed, failed, errors: errors.slice(0, 10) });
		db.prepare(
			"UPDATE jobs SET status = 'completed', progress = total, finished_at = datetime('now'), result = ? WHERE id = ?"
		).run(result, jobId);

		log.info('Removal from player completed', { jobId, playerId, removed, failed });
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : 'Unknown error';
		const result = JSON.stringify({ removed, failed, errors: errors.slice(0, 10) });
		db.prepare(
			"UPDATE jobs SET status = 'failed', error = ?, finished_at = datetime('now'), result = ? WHERE id = ?"
		).run(errorMsg, result, jobId);
		log.error('Remove job failed', { jobId, error: errorMsg });
	}
}

