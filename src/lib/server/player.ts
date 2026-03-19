import db from './db.js';
import { getPlayerManagedPath, getPlayer, type Player } from './players.js';
import { isSupportedAudioFile } from './metadata.js';
import { createLogger } from './logger.js';
import fs from 'node:fs';
import path from 'node:path';
import type { ScanProgress } from './scanner.js';

const log = createLogger('player');

type ProgressCallback = (progress: ScanProgress) => void;

/**
 * Recursively walk a directory and return all file paths.
 */
function walkDir(dir: string): string[] {
	const results: string[] = [];
	try {
		const entries = fs.readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				results.push(...walkDir(fullPath));
			} else if (entry.isFile() && isSupportedAudioFile(entry.name)) {
				results.push(fullPath);
			}
		}
	} catch {
		// Skip directories we can't read
	}
	return results;
}

/**
 * Scan a player's managed directory and cross-reference with library.
 */
export async function scanPlayer(
	playerId: number,
	onProgress?: ProgressCallback
): Promise<void> {
	const player = getPlayer(playerId);
	if (!player) {
		log.error('Player not found', { playerId });
		onProgress?.({
			phase: 'error',
			current: 0,
			total: 0,
			error: 'Player not found'
		});
		return;
	}

	const managedPath = getPlayerManagedPath(playerId);
	log.info('Starting player scan', { playerId, managedPath });

	if (!managedPath) {
		log.error('Managed directory not configured', { playerId });
		onProgress?.({
			phase: 'error',
			current: 0,
			total: 0,
			error: 'Managed directory not configured'
		});
		return;
	}

	if (!fs.existsSync(managedPath)) {
		log.error('Managed directory does not exist on player', { playerId, managedPath });
		onProgress?.({
			phase: 'error',
			current: 0,
			total: 0,
			error: 'Managed directory does not exist on player'
		});
		return;
	}

	const job = db
		.prepare("INSERT INTO jobs (type, status, player_id) VALUES ('player_scan', 'running', ?)")
		.run(playerId);
	const jobId = job.lastInsertRowid;
	log.info('Created player scan job', { jobId, playerId });

	try {
		onProgress?.({ phase: 'discovering', current: 0, total: 0 });
		const files = walkDir(managedPath);
		const total = files.length;

		log.info('Player file discovery complete', { playerId, totalFiles: total, managedPath });
		if (total === 0) {
			log.warn('No audio files found on player', { playerId, managedPath });
		}

		db.prepare('UPDATE jobs SET total = ? WHERE id = ?').run(total, jobId);
		onProgress?.({ phase: 'scanning', current: 0, total });

		// Clear existing player tracks for this player and re-index
		db.prepare('DELETE FROM player_tracks WHERE player_id = ?').run(playerId);

		const findLibraryTrack = db.prepare(
			'SELECT id FROM library_tracks WHERE relative_path = ?'
		);
		const insertStmt = db.prepare(`
			INSERT INTO player_tracks (player_id, relative_path, library_track_id, file_size, is_orphan, synced_at)
			VALUES (?, ?, ?, ?, ?, datetime('now'))
		`);

		for (let i = 0; i < files.length; i++) {
			const filePath = files[i];
			const relativePath = path.relative(managedPath, filePath);
			const stat = fs.statSync(filePath);

			// Try to match with library by relative path
			const libraryTrack = findLibraryTrack.get(relativePath) as { id: number } | undefined;

			insertStmt.run(
				playerId,
				relativePath,
				libraryTrack?.id || null,
				stat.size,
				libraryTrack ? 0 : 1 // orphan if not in library
			);

			if (i % 10 === 0) {
				onProgress?.({ phase: 'scanning', current: i + 1, total, currentFile: relativePath });
				db.prepare('UPDATE jobs SET progress = ? WHERE id = ?').run(i + 1, jobId);
			}
		}

		db.prepare(
			"UPDATE jobs SET status = 'completed', progress = total, finished_at = datetime('now') WHERE id = ?"
		).run(jobId);

		const orphanCount = (db.prepare('SELECT COUNT(*) as count FROM player_tracks WHERE player_id = ? AND is_orphan = 1').get(playerId) as { count: number }).count;
		const totalTracks = (db.prepare('SELECT COUNT(*) as count FROM player_tracks WHERE player_id = ?').get(playerId) as { count: number }).count;
		log.info('Player scan completed', { jobId, playerId, totalFiles: total, tracksInDb: totalTracks, orphans: orphanCount });
		onProgress?.({ phase: 'complete', current: total, total });
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : 'Unknown error';
		log.error('Player scan failed', { jobId, playerId, error: errorMsg });
		db.prepare(
			"UPDATE jobs SET status = 'failed', error = ?, finished_at = datetime('now') WHERE id = ?"
		).run(errorMsg, jobId);
		onProgress?.({ phase: 'error', current: 0, total: 0, error: errorMsg });
	}
}

/**
 * Get storage information for a specific player.
 */
export function getPlayerStorage(playerId: number): {
	total: number;
	used: number;
	free: number;
	managedSize: number;
} {
	const player = getPlayer(playerId);
	if (!player) {
		log.error('Player not found for storage info', { playerId });
		return { total: 0, used: 0, free: 0, managedSize: 0 };
	}

	try {
		const stats = fs.statfsSync(player.mount_path);
		const blockSize = stats.bsize;
		const total = stats.blocks * blockSize;
		const free = stats.bavail * blockSize;
		const used = total - free;

		// Calculate size of managed directory for this player
		const managedSize = (db.prepare(
			'SELECT COALESCE(SUM(file_size), 0) as total FROM player_tracks WHERE player_id = ?'
		).get(playerId) as { total: number }).total;

		log.debug('Player storage info', { playerId, mountPath: player.mount_path, total, used, free, managedSize });
		return { total, used, free, managedSize };
	} catch (err) {
		log.error('Failed to get player storage info', { playerId, mountPath: player.mount_path, error: err instanceof Error ? err.message : String(err) });
		return { total: 0, used: 0, free: 0, managedSize: 0 };
	}
}
