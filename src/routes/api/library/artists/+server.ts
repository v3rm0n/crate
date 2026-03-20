import { json } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import { getActivePlayerId } from '$lib/server/players.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ url }) => {
	const syncFilter = url.searchParams.get('sync');
	const search = url.searchParams.get('q');
	const playerIdParam = url.searchParams.get('player_id');
	const playerId = playerIdParam ? parseInt(playerIdParam, 10) : getActivePlayerId();

	const params: (string | number)[] = [];
	let playerJoin: string;

	if (playerId) {
		playerJoin = 'LEFT JOIN player_tracks pt ON pt.library_track_id = lt.id AND pt.player_id = ?';
		params.push(playerId);
	} else {
		playerJoin = 'LEFT JOIN player_tracks pt ON pt.library_track_id = lt.id';
	}

	let whereClause = 'WHERE 1=1';
	if (search) {
		whereClause += ' AND COALESCE(lt.album_artist, lt.artist) LIKE ?';
		params.push(`%${search}%`);
	}

	let query = `
		SELECT
			COALESCE(lt.album_artist, lt.artist) as name,
			COUNT(DISTINCT lt.album) as album_count,
			COUNT(lt.id) as track_count,
			COUNT(pt.id) as synced_count,
			COALESCE(SUM(lt.file_size), 0) as total_size
		FROM library_tracks lt
		${playerJoin}
		${whereClause}
		GROUP BY COALESCE(lt.album_artist, lt.artist)
	`;

	if (syncFilter === 'synced') {
		query += ' HAVING synced_count = track_count';
	} else if (syncFilter === 'partial') {
		query += ' HAVING synced_count > 0 AND synced_count < track_count';
	} else if (syncFilter === 'unsynced') {
		query += ' HAVING synced_count = 0';
	}

	query += ' ORDER BY name COLLATE NOCASE';

	const artists = db.prepare(query).all(...params);
	return json({ artists, playerId });
};
