import { json } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import { getActivePlayerId } from '$lib/server/players.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ url }) => {
	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = parseInt(url.searchParams.get('limit') || '100');
	const offset = (page - 1) * limit;
	const search = url.searchParams.get('q');
	const orphansOnly = url.searchParams.get('orphans') === '1';
	const playerIdParam = url.searchParams.get('player_id');

	// Get player ID from query param or fallback to active player
	const playerId = playerIdParam ? parseInt(playerIdParam, 10) : getActivePlayerId();

	if (!playerId) {
		return json({ error: 'No player specified and no active player' }, { status: 400 });
	}

	let whereClause = 'WHERE pt.player_id = ?';
	const params: (string | number)[] = [playerId];

	if (orphansOnly) {
		whereClause += ' AND pt.is_orphan = 1';
	}

	if (search) {
		whereClause += ' AND (pt.relative_path LIKE ? OR lt.title LIKE ? OR lt.artist LIKE ? OR lt.album LIKE ?)';
		const searchTerm = `%${search}%`;
		params.push(searchTerm, searchTerm, searchTerm, searchTerm);
	}

	const countQuery = `
		SELECT COUNT(*) as total
		FROM player_tracks pt
		LEFT JOIN library_tracks lt ON lt.id = pt.library_track_id
		${whereClause}
	`;
	const total = (db.prepare(countQuery).get(...params) as { total: number }).total;

	const query = `
		SELECT pt.*, lt.title, lt.artist, lt.album, lt.album_artist, lt.duration, lt.format, lt.bitrate
		FROM player_tracks pt
		LEFT JOIN library_tracks lt ON lt.id = pt.library_track_id
		${whereClause}
		ORDER BY pt.relative_path
		LIMIT ? OFFSET ?
	`;

	const tracks = db.prepare(query).all(...params, limit, offset);
	return json({ tracks, playerId, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};
