import { json } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import { removeFromPlayer } from '$lib/server/sync.js';
import { getActivePlayerId } from '$lib/server/players.js';
import { createLogger } from '$lib/server/logger.js';
import type { RequestHandler } from './$types.js';

const log = createLogger('api:sync:remove');

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { trackIds: rawTrackIds, artist, album, playerId: playerIdParam } = body;

	const playerId = playerIdParam ?? getActivePlayerId();
	if (!playerId) {
		return json({ error: 'No player specified and no active player' }, { status: 400 });
	}

	let trackIds: number[];

	if (Array.isArray(rawTrackIds) && rawTrackIds.length > 0) {
		trackIds = rawTrackIds;
	} else if (artist) {
		// Resolve player track IDs for an artist (and optionally album)
		let query = `
			SELECT pt.id FROM player_tracks pt
			JOIN library_tracks lt ON lt.id = pt.library_track_id
			WHERE pt.player_id = ? AND (lt.album_artist = ? OR lt.artist = ?)
		`;
		const params: (string | number)[] = [playerId, artist, artist];

		if (album) {
			query += ' AND lt.album = ?';
			params.push(album);
		}

		trackIds = (db.prepare(query).all(...params) as { id: number }[]).map(r => r.id);

		if (trackIds.length === 0) {
			return json({ removed: 0, failed: 0, errors: [] });
		}

		log.info('Resolved tracks for batch remove', { artist, album, playerId, trackCount: trackIds.length });
	} else {
		log.warn('Remove request rejected: no trackIds, artist, or album');
		return json({ error: 'trackIds array or artist is required' }, { status: 400 });
	}

	log.info('Remove from player requested', { playerId, trackCount: trackIds.length });
	const result = await removeFromPlayer(playerId, trackIds);
	log.info('Remove from player result', { playerId, removed: result.removed, failed: result.failed });
	return json(result);
};
