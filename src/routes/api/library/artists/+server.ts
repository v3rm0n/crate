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

	// Two-level grouping:
	// 1. Inner: group by MB artist ID (merges "DJ Zinc" + "Zinc")
	// 2. Outer: group by resolved display name (merges groups that resolve to the same name,
	//    e.g. two different MB IDs that both resolve to "Brookes Brothers")
	let query = `
		SELECT
			name,
			SUM(album_count) as album_count,
			SUM(track_count) as track_count,
			SUM(synced_count) as synced_count,
			SUM(total_size) as total_size
		FROM (
			SELECT
				(SELECT COALESCE(lt2.album_artist, lt2.artist)
				 FROM library_tracks lt2
				 WHERE COALESCE(lt2.mb_artist_id, COALESCE(lt2.album_artist, lt2.artist))
				       = COALESCE(lt.mb_artist_id, COALESCE(lt.album_artist, lt.artist))
				 GROUP BY COALESCE(lt2.album_artist, lt2.artist)
				 ORDER BY COUNT(*) DESC
				 LIMIT 1
				) as name,
				COUNT(DISTINCT lt.album) as album_count,
				COUNT(lt.id) as track_count,
				COUNT(pt.id) as synced_count,
				COALESCE(SUM(lt.file_size), 0) as total_size
			FROM library_tracks lt
			${playerJoin}
			${whereClause}
			GROUP BY COALESCE(lt.mb_artist_id, COALESCE(lt.album_artist, lt.artist))
		)
		GROUP BY name
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
