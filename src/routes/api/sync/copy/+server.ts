import { json } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import { startCopyToPlayer } from '$lib/server/sync.js';
import { getActivePlayerId } from '$lib/server/players.js';
import { createLogger } from '$lib/server/logger.js';
import type { RequestHandler } from './$types.js';

const log = createLogger('api:sync:copy');

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
		let query = `
			SELECT lt.id FROM library_tracks lt
			LEFT JOIN player_tracks pt ON pt.library_track_id = lt.id AND pt.player_id = ?
			WHERE pt.id IS NULL AND (
				lt.album_artist = ? OR lt.artist = ?
				OR (lt.mb_artist_id IS NOT NULL AND lt.mb_artist_id IN (
					SELECT mb_artist_id FROM library_tracks
					WHERE (album_artist = ? OR artist = ?) AND mb_artist_id IS NOT NULL
				))
			)
		`;
		const params: (string | number)[] = [playerId, artist, artist, artist, artist];

		if (album) {
			query += ' AND lt.album = ?';
			params.push(album);
		}

		trackIds = (db.prepare(query).all(...params) as { id: number }[]).map(r => r.id);

		if (trackIds.length === 0) {
			return json({ jobId: null, total: 0 });
		}

		log.info('Resolved tracks for batch sync', { artist, album, playerId, trackCount: trackIds.length });
	} else {
		log.warn('Copy request rejected: no trackIds, artist, or album');
		return json({ error: 'trackIds array or artist is required' }, { status: 400 });
	}

	log.info('Copy to player requested', { playerId, trackCount: trackIds.length });
	const jobId = startCopyToPlayer(playerId, trackIds);
	return json({ jobId, total: trackIds.length });
};
