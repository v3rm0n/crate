import { json } from '@sveltejs/kit';
import { removeFromPlayer } from '$lib/server/sync.js';
import { getActivePlayerId } from '$lib/server/players.js';
import { createLogger } from '$lib/server/logger.js';
import type { RequestHandler } from './$types.js';

const log = createLogger('api:sync:remove');

export const POST: RequestHandler = async ({ request }) => {
	const { trackIds, playerId: playerIdParam } = await request.json();

	if (!Array.isArray(trackIds) || trackIds.length === 0) {
		log.warn('Remove request rejected: empty or missing trackIds');
		return json({ error: 'trackIds array is required' }, { status: 400 });
	}

	const playerId = playerIdParam ?? getActivePlayerId();
	if (!playerId) {
		return json({ error: 'No player specified and no active player' }, { status: 400 });
	}

	log.info('Remove from player requested', { playerId, trackCount: trackIds.length });
	const result = await removeFromPlayer(playerId, trackIds);
	log.info('Remove from player result', { playerId, removed: result.removed, failed: result.failed });
	return json(result);
};
