import db from './db.js';
import { getLibraryPath } from './settings.js';
import { extractMetadata, extractCover, isSupportedAudioFile } from './metadata.js';
import { createLogger } from './logger.js';
import fs from 'node:fs';
import path from 'node:path';

const log = createLogger('scanner');

export interface ScanProgress {
	phase: 'discovering' | 'scanning' | 'complete' | 'error';
	current: number;
	total: number;
	currentFile?: string;
	error?: string;
}

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
 * Scan the music library and index all tracks.
 */
export async function scanLibrary(onProgress?: ProgressCallback): Promise<void> {
	const libraryPath = getLibraryPath();
	log.info('Starting library scan', { libraryPath });

	if (!fs.existsSync(libraryPath)) {
		log.error('Library path does not exist', { libraryPath });
		onProgress?.({ phase: 'error', current: 0, total: 0, error: 'Library path does not exist' });
		return;
	}

	// Check if library directory is readable and non-empty
	try {
		const topLevelEntries = fs.readdirSync(libraryPath);
		log.info('Library directory contents', {
			libraryPath,
			entryCount: topLevelEntries.length,
			entries: topLevelEntries.slice(0, 20)
		});
		if (topLevelEntries.length === 0) {
			log.warn('Library directory is empty — no files to scan. Check your volume mount.', { libraryPath });
		}
	} catch (err) {
		log.error('Cannot read library directory', {
			libraryPath,
			error: err instanceof Error ? err.message : String(err)
		});
	}

	// Create job record
	const job = db
		.prepare("INSERT INTO jobs (type, status) VALUES ('library_scan', 'running')")
		.run();
	const jobId = job.lastInsertRowid;
	log.info('Created scan job', { jobId });

	try {
		// Phase 1: Discover files
		onProgress?.({ phase: 'discovering', current: 0, total: 0 });
		const files = walkDir(libraryPath);
		const total = files.length;

		log.info('File discovery complete', { totalFiles: total, libraryPath });
		if (total === 0) {
			log.warn('No supported audio files found in library. Supported formats: .flac, .mp3, .ogg, .aac, .wav, .m4a', { libraryPath });
		}

		db.prepare('UPDATE jobs SET total = ? WHERE id = ?').run(total, jobId);
		onProgress?.({ phase: 'scanning', current: 0, total });

		// Get existing tracks to detect changes
		const existingTracks = new Map<string, number>(
			(
				db
					.prepare('SELECT relative_path, last_modified FROM library_tracks')
					.all() as { relative_path: string; last_modified: number }[]
			).map((t) => [t.relative_path, t.last_modified])
		);

		// Track which relative paths are still present
		const seenPaths = new Set<string>();

		const insertStmt = db.prepare(`
			INSERT INTO library_tracks (relative_path, title, artist, album, album_artist, genre, track_number, disc_number, year, duration, format, bitrate, sample_rate, file_size, last_modified, scanned_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
			ON CONFLICT(relative_path) DO UPDATE SET
				title = excluded.title,
				artist = excluded.artist,
				album = excluded.album,
				album_artist = excluded.album_artist,
				genre = excluded.genre,
				track_number = excluded.track_number,
				disc_number = excluded.disc_number,
				year = excluded.year,
				duration = excluded.duration,
				format = excluded.format,
				bitrate = excluded.bitrate,
				sample_rate = excluded.sample_rate,
				file_size = excluded.file_size,
				last_modified = excluded.last_modified,
				scanned_at = datetime('now')
		`);

		// Load existing art keys so we don't re-extract art we already have
		const existingArtKeys = new Set<string>(
			(db.prepare('SELECT id FROM album_art').all() as { id: string }[]).map(r => r.id)
		);
		const insertArtStmt = db.prepare(
			'INSERT OR IGNORE INTO album_art (id, data, mime_type) VALUES (?, ?, ?)'
		);

		let skippedCount = 0;
		let insertedCount = 0;
		let metadataFailCount = 0;

		for (let i = 0; i < files.length; i++) {
			const filePath = files[i];
			const relativePath = path.relative(libraryPath, filePath);
			seenPaths.add(relativePath);

			// Check if file has been modified since last scan
			const stat = fs.statSync(filePath);
			const mtime = Math.floor(stat.mtimeMs);
			const existingMtime = existingTracks.get(relativePath);

			if (existingMtime !== undefined && existingMtime === mtime) {
				// File unchanged, skip metadata extraction
				skippedCount++;
				if (i % 100 === 0) {
					onProgress?.({ phase: 'scanning', current: i + 1, total, currentFile: relativePath });
					db.prepare('UPDATE jobs SET progress = ? WHERE id = ?').run(i + 1, jobId);
				}
				continue;
			}

			const metadata = await extractMetadata(filePath);

			if (metadata) {
				insertStmt.run(
					relativePath,
					metadata.title,
					metadata.artist,
					metadata.album,
					metadata.albumArtist,
					metadata.genre,
					metadata.trackNumber,
					metadata.discNumber,
					metadata.year,
					metadata.duration,
					metadata.format,
					metadata.bitrate,
					metadata.sampleRate,
					stat.size,
					mtime
				);
				insertedCount++;

				// Try to extract album art if we don't already have it for this album
				if (metadata.album) {
					const artKey = `${metadata.albumArtist || metadata.artist || ''}:${metadata.album}`;
					if (!existingArtKeys.has(artKey)) {
						existingArtKeys.add(artKey); // Mark as seen to avoid re-extraction within this scan
						const cover = await extractCover(filePath);
						if (cover) {
							insertArtStmt.run(artKey, cover.data, cover.mimeType);
						}
					}
				}
			} else {
				metadataFailCount++;
				log.warn('Failed to extract metadata', { file: relativePath });
			}

			if (i % 10 === 0) {
				onProgress?.({ phase: 'scanning', current: i + 1, total, currentFile: relativePath });
				db.prepare('UPDATE jobs SET progress = ? WHERE id = ?').run(i + 1, jobId);
			}
		}

		log.info('Scan processing summary', {
			total,
			inserted: insertedCount,
			skippedUnchanged: skippedCount,
			metadataFailed: metadataFailCount
		});

		// Remove tracks no longer present on disk
		const allPaths = (
			db.prepare('SELECT relative_path FROM library_tracks').all() as {
				relative_path: string;
			}[]
		).map((t) => t.relative_path);

		let removedCount = 0;
		const deleteStmt = db.prepare('DELETE FROM library_tracks WHERE relative_path = ?');
		for (const existingPath of allPaths) {
			if (!seenPaths.has(existingPath)) {
				deleteStmt.run(existingPath);
				removedCount++;
			}
		}

		if (removedCount > 0) {
			log.info('Removed stale tracks no longer on disk', { removedCount });
		}

		db.prepare(
			"UPDATE jobs SET status = 'completed', progress = total, finished_at = datetime('now') WHERE id = ?"
		).run(jobId);

		const dbTrackCount = (db.prepare('SELECT COUNT(*) as count FROM library_tracks').get() as { count: number }).count;
		log.info('Library scan completed', { jobId, totalFiles: total, tracksInDb: dbTrackCount, removedCount });
		onProgress?.({ phase: 'complete', current: total, total });
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : 'Unknown error';
		log.error('Library scan failed', { jobId, error: errorMsg });
		db.prepare(
			"UPDATE jobs SET status = 'failed', error = ?, finished_at = datetime('now') WHERE id = ?"
		).run(errorMsg, jobId);
		onProgress?.({ phase: 'error', current: 0, total: 0, error: errorMsg });
	}
}
