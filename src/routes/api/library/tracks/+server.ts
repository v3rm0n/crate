import { json } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import type { RequestHandler } from './$types.js';

const ALLOWED_SORT_COLUMNS: Record<string, string> = {
	title: 'lt.title',
	artist: 'COALESCE(lt.album_artist, lt.artist)',
	album: 'lt.album',
	duration: 'lt.duration',
	format: 'lt.format',
	bitrate: 'lt.bitrate',
	year: 'lt.year',
	file_size: 'lt.file_size',
	track_number: 'lt.disc_number, lt.track_number'
};

export const GET: RequestHandler = async ({ url }) => {
	const album = url.searchParams.get('album');
	const artist = url.searchParams.get('artist');
	const search = url.searchParams.get('q');
	const syncFilter = url.searchParams.get('sync');
	const sortBy = url.searchParams.get('sort') || 'artist';
	const sortDir = url.searchParams.get('order') === 'desc' ? 'DESC' : 'ASC';
	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = parseInt(url.searchParams.get('limit') || '100');
	const offset = (page - 1) * limit;

	let whereClause = 'WHERE 1=1';
	const params: (string | number)[] = [];

	if (album) {
		whereClause += ' AND lt.album = ?';
		params.push(album);
	}

	if (artist) {
		whereClause += ' AND (lt.album_artist = ? OR lt.artist = ?)';
		params.push(artist, artist);
	}

	if (search) {
		whereClause += ' AND (lt.title LIKE ? OR lt.artist LIKE ? OR lt.album LIKE ? OR lt.album_artist LIKE ?)';
		const searchTerm = `%${search}%`;
		params.push(searchTerm, searchTerm, searchTerm, searchTerm);
	}

	// Sync filter requires a HAVING or sub-select since is_synced is computed
	let syncCondition = '';
	if (syncFilter === 'synced') {
		syncCondition = ' AND pt.id IS NOT NULL';
	} else if (syncFilter === 'unsynced') {
		syncCondition = ' AND pt.id IS NULL';
	}

	const fullWhere = whereClause + syncCondition;

	const countQuery = `
		SELECT COUNT(*) as total
		FROM library_tracks lt
		LEFT JOIN player_tracks pt ON pt.library_track_id = lt.id
		${fullWhere}
	`;
	const total = (db.prepare(countQuery).get(...params) as { total: number }).total;

	// Build ORDER BY clause
	const sortColumn = ALLOWED_SORT_COLUMNS[sortBy] || ALLOWED_SORT_COLUMNS['artist'];
	// For artist sort, add album and track number as secondary sort
	let orderClause: string;
	if (sortBy === 'artist') {
		orderClause = `${sortColumn} COLLATE NOCASE ${sortDir}, lt.album COLLATE NOCASE ASC, lt.disc_number ASC, lt.track_number ASC`;
	} else if (sortBy === 'album') {
		orderClause = `${sortColumn} COLLATE NOCASE ${sortDir}, lt.disc_number ASC, lt.track_number ASC`;
	} else if (sortBy === 'title') {
		orderClause = `${sortColumn} COLLATE NOCASE ${sortDir}`;
	} else {
		orderClause = `${sortColumn} ${sortDir}`;
	}

	const query = `
		SELECT
			lt.*,
			CASE WHEN pt.id IS NOT NULL THEN 1 ELSE 0 END as is_synced,
			pt.id as player_track_id
		FROM library_tracks lt
		LEFT JOIN player_tracks pt ON pt.library_track_id = lt.id
		${fullWhere}
		ORDER BY ${orderClause}
		LIMIT ? OFFSET ?
	`;

	const tracks = db.prepare(query).all(...params, limit, offset);
	return json({ tracks, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};
