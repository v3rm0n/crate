import db from './db.js';
import { getSetting, setSetting } from './settings.js';
import { createLogger } from './logger.js';
import fs from 'node:fs';
import path from 'node:path';

const log = createLogger('players');

export interface Player {
	id: number;
	name: string;
	mount_path: string;
	managed_dir: string;
	is_active: number;
	created_at: string;
}

export interface PlayerWithStats extends Player {
	track_count: number;
	total_size: number;
}

/**
 * Get the base mount path for discovering players.
 * This is where drives would be mounted (e.g., /mnt/disks in Unraid).
 */
export function getPlayerMountBase(): string {
	return process.env.PLAYER_MOUNT_BASE || getSetting('player_mount_base') || '/player';
}

/**
 * Set the base mount path for discovering players.
 */
export function setPlayerMountBase(basePath: string): void {
	setSetting('player_mount_base', basePath);
	log.info('Updated player mount base', { basePath });
}

/**
 * Discover potential DAPs (Digital Audio Players) in the mount base directory.
 * Returns directories that look like mounted drives.
 */
export function discoverPlayers(): { name: string; path: string }[] {
	const basePath = getPlayerMountBase();

	if (!fs.existsSync(basePath)) {
		log.warn('Player mount base does not exist', { basePath });
		return [];
	}

	try {
		const entries = fs.readdirSync(basePath, { withFileTypes: true });
		const players = entries
			.filter((e) => e.isDirectory())
			.map((e) => ({
				name: e.name,
				path: path.join(basePath, e.name)
			}))
			.sort((a, b) => a.name.localeCompare(b.name));

		log.debug('Discovered potential players', { basePath, count: players.length });
		return players;
	} catch (err) {
		log.error('Failed to discover players', { basePath, error: err instanceof Error ? err.message : String(err) });
		return [];
	}
}

/**
 * Get all configured players.
 */
export function getPlayers(): PlayerWithStats[] {
	const players = db.prepare(`
		SELECT
			p.*,
			COUNT(pt.id) as track_count,
			COALESCE(SUM(pt.file_size), 0) as total_size
		FROM players p
		LEFT JOIN player_tracks pt ON pt.player_id = p.id
		GROUP BY p.id
		ORDER BY p.created_at
	`).all() as PlayerWithStats[];

	return players;
}

/**
 * Get a specific player by ID.
 */
export function getPlayer(id: number): Player | undefined {
	return db.prepare('SELECT * FROM players WHERE id = ?').get(id) as Player | undefined;
}

/**
 * Get the currently active player.
 */
export function getActivePlayer(): Player | undefined {
	return db.prepare('SELECT * FROM players WHERE is_active = 1').get() as Player | undefined;
}

/**
 * Get the ID of the currently active player.
 */
export function getActivePlayerId(): number | undefined {
	const player = getActivePlayer();
	return player?.id;
}

/**
 * Get the full path to a player's managed directory.
 */
export function getPlayerManagedPath(playerId: number): string | null {
	const player = getPlayer(playerId);
	if (!player) return null;
	return path.join(player.mount_path, player.managed_dir);
}

/**
 * Get the full path to the active player's managed directory.
 */
export function getActivePlayerManagedPath(): string | null {
	const player = getActivePlayer();
	if (!player) return null;
	return path.join(player.mount_path, player.managed_dir);
}

/**
 * Create a new player.
 */
export function createPlayer(
	name: string,
	mountPath: string,
	managedDir: string = ''
): Player {
	// If this is the first player, make it active
	const existingCount = db.prepare('SELECT COUNT(*) as count FROM players').get() as { count: number };
	const isActive = existingCount.count === 0 ? 1 : 0;

	const result = db.prepare(`
		INSERT INTO players (name, mount_path, managed_dir, is_active)
		VALUES (?, ?, ?, ?)
	`).run(name, mountPath, managedDir, isActive);

	const player = getPlayer(result.lastInsertRowid as number);
	if (!player) {
		throw new Error('Failed to create player');
	}

	log.info('Created new player', { playerId: player.id, name, mountPath, managedDir });
	return player;
}

/**
 * Update a player.
 */
export function updatePlayer(
	id: number,
	updates: Partial<Pick<Player, 'name' | 'managed_dir'>>
): Player | undefined {
	const player = getPlayer(id);
	if (!player) return undefined;

	if (updates.name !== undefined) {
		db.prepare('UPDATE players SET name = ? WHERE id = ?').run(updates.name, id);
	}
	if (updates.managed_dir !== undefined) {
		db.prepare('UPDATE players SET managed_dir = ? WHERE id = ?').run(updates.managed_dir, id);
	}

	log.info('Updated player', { playerId: id, updates });
	return getPlayer(id);
}

/**
 * Set a player as the active player.
 */
export function setActivePlayer(id: number): boolean {
	const player = getPlayer(id);
	if (!player) return false;

	db.transaction(() => {
		// Deactivate all players
		db.prepare('UPDATE players SET is_active = 0').run();
		// Activate the selected player
		db.prepare('UPDATE players SET is_active = 1 WHERE id = ?').run(id);
	})();

	log.info('Set active player', { playerId: id, name: player.name });
	return true;
}

/**
 * Delete a player and all associated data.
 */
export function deletePlayer(id: number): boolean {
	const player = getPlayer(id);
	if (!player) return false;

	db.prepare('DELETE FROM players WHERE id = ?').run(id);

	log.info('Deleted player', { playerId: id, name: player.name });
	return true;
}

/**
 * List top-level directories within a player's mount path.
 * Used for selecting the managed directory.
 */
export function listPlayerDirectories(
	playerId: number,
	subPath?: string
): { name: string; path: string; isDir: boolean }[] {
	const player = getPlayer(playerId);
	if (!player) return [];

	const targetPath = subPath ? path.join(player.mount_path, subPath) : player.mount_path;

	if (!fs.existsSync(targetPath)) return [];

	try {
		const entries = fs.readdirSync(targetPath, { withFileTypes: true });
		return entries
			.filter((e) => e.isDirectory())
			.map((e) => ({
				name: e.name,
				path: subPath ? path.join(subPath, e.name) : e.name,
				isDir: true
			}))
			.sort((a, b) => a.name.localeCompare(b.name));
	} catch {
		return [];
	}
}
