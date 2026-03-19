import { json } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import { removeFromPlayer } from '$lib/server/sync.js';
import { getActivePlayerId } from '$lib/server/players.js';
import { createLogger } from '$lib/server/logger.js';
import type { RequestHandler } from './$types.js';

const log = createLogger('api:sync:remove-all');

export const POST: RequestHandler = async ({ request }) => {
	const { playerId: playerIdParam } = await request.json();
	const playerId = playerIdParam ?? getActivePlayerId();

	if (!playerId) {
		return json({ error: 'No player specified and no active player' }, { status: 400 });
	}

	const allTracks = db.prepare('SELECT id FROM player_tracks WHERE player_id = ?').all(playerId) as { id: number }[];
	const trackIds = allTracks.map(t => t.id);

	if (trackIds.length === 0) {
		log.info('Remove all requested but no tracks on player', { playerId });
		return json({ removed: 0, failed: 0, errors: [] });
	}

	log.info('Remove ALL tracks from player requested', { playerId, trackCount: trackIds.length });
	const result = await removeFromPlayer(playerId, trackIds);
	log.info('Remove all result', { playerId, removed: result.removed, failed: result.failed });
	return json(result);
};
