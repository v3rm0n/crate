import { json } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import { getActivePlayerId } from '$lib/server/players.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ url }) => {
	const playerIdParam = url.searchParams.get('player_id');
	const playerId = playerIdParam ? parseInt(playerIdParam, 10) : getActivePlayerId();

	if (!playerId) {
		return json({ error: 'No player specified and no active player' }, { status: 400 });
	}

	const orphans = db.prepare(`
		SELECT id, relative_path, file_size, synced_at
		FROM player_tracks
		WHERE player_id = ? AND is_orphan = 1
		ORDER BY relative_path
	`).all(playerId);

	return json({ orphans, playerId });
};
