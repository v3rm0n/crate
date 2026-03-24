import { json } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import { getActivePlayerId } from '$lib/server/players.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ url }) => {
	const artist = url.searchParams.get('artist');
	const search = url.searchParams.get('q');
	const syncFilter = url.searchParams.get('sync');
	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = parseInt(url.searchParams.get('limit') || '50');
	const offset = (page - 1) * limit;
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

	if (artist) {
		// Match by name OR by MusicBrainz ID (so grouped artists show all their albums)
		whereClause += ` AND (
			lt.album_artist = ? OR lt.artist = ?
			OR (lt.mb_artist_id IS NOT NULL AND lt.mb_artist_id IN (
				SELECT mb_artist_id FROM library_tracks
				WHERE (album_artist = ? OR artist = ?) AND mb_artist_id IS NOT NULL
			))
		)`;
		params.push(artist, artist, artist, artist);
	}

	if (search) {
		whereClause += ' AND (lt.album LIKE ? OR lt.artist LIKE ? OR lt.album_artist LIKE ?)';
		const searchTerm = `%${search}%`;
		params.push(searchTerm, searchTerm, searchTerm);
	}

	let havingClause = '';
	if (syncFilter === 'synced') {
		havingClause = 'HAVING synced_count = track_count';
	} else if (syncFilter === 'partial') {
		havingClause = 'HAVING synced_count > 0 AND synced_count < track_count';
	} else if (syncFilter === 'unsynced') {
		havingClause = 'HAVING synced_count = 0';
	}

	const countQuery = `
		SELECT COUNT(*) as total FROM (
			SELECT lt.album, COUNT(lt.id) as track_count, COUNT(pt.id) as synced_count
			FROM library_tracks lt
			${playerJoin}
			${whereClause}
			GROUP BY lt.album, COALESCE(lt.album_artist, lt.artist)
			${havingClause}
		)
	`;

	const total = (db.prepare(countQuery).get(...params) as { total: number }).total;

	const query = `
		SELECT
			lt.album,
			COALESCE(lt.album_artist, lt.artist) as artist,
			MIN(lt.year) as year,
			COUNT(lt.id) as track_count,
			COUNT(pt.id) as synced_count,
			SUM(lt.file_size) as total_size,
			MIN(lt.id) as first_track_id
		FROM library_tracks lt
		${playerJoin}
		${whereClause}
		GROUP BY lt.album, COALESCE(lt.album_artist, lt.artist)
		${havingClause}
		ORDER BY artist COLLATE NOCASE, lt.year, lt.album COLLATE NOCASE
		LIMIT ? OFFSET ?
	`;

	const albums = db.prepare(query).all(...params, limit, offset);

	return json({
		albums,
		playerId,
		pagination: { page, limit, total, pages: Math.ceil(total / limit) }
	});
};
