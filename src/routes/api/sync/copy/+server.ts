import { json } from '@sveltejs/kit';
import { copyToPlayer } from '$lib/server/sync.js';
import { getActivePlayerId } from '$lib/server/players.js';
import { createLogger } from '$lib/server/logger.js';
import type { RequestHandler } from './$types.js';

const log = createLogger('api:sync:copy');

export const POST: RequestHandler = async ({ request }) => {
	const { trackIds, playerId: playerIdParam } = await request.json();

	if (!Array.isArray(trackIds) || trackIds.length === 0) {
		log.warn('Copy request rejected: empty or missing trackIds');
		return json({ error: 'trackIds array is required' }, { status: 400 });
	}

	const playerId = playerIdParam ?? getActivePlayerId();
	if (!playerId) {
		return json({ error: 'No player specified and no active player' }, { status: 400 });
	}

	log.info('Copy to player requested', { playerId, trackCount: trackIds.length });
	const result = await copyToPlayer(playerId, trackIds);
	log.info('Copy to player result', { playerId, copied: result.copied, failed: result.failed });
	return json(result);
};
