import { json } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import { getActivePlayerId } from '$lib/server/players.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ url }) => {
	// Get player ID from query param or fallback to active player
	const playerIdParam = url.searchParams.get('player_id');
	const playerId = playerIdParam ? parseInt(playerIdParam, 10) : getActivePlayerId();

	const stats = db.prepare(`
		SELECT
			COUNT(*) as total_tracks,
			COUNT(DISTINCT COALESCE(album_artist, artist)) as total_artists,
			COUNT(DISTINCT album) as total_albums,
			COALESCE(SUM(file_size), 0) as total_size,
			COALESCE(SUM(duration), 0) as total_duration
		FROM library_tracks
	`).get() as Record<string, number>;

	// Get sync stats for specific player or all players
	let syncQuery: string;
	let syncParams: (number | undefined)[];
	
	if (playerId) {
		syncQuery = `
			SELECT COUNT(DISTINCT pt.library_track_id) as synced_tracks
			FROM player_tracks pt
			WHERE pt.library_track_id IS NOT NULL AND pt.player_id = ?
		`;
		syncParams = [playerId];
	} else {
		syncQuery = `
			SELECT COUNT(DISTINCT pt.library_track_id) as synced_tracks
			FROM player_tracks pt
			WHERE pt.library_track_id IS NOT NULL
		`;
		syncParams = [];
	}
	
	const syncStats = db.prepare(syncQuery).get(...syncParams) as { synced_tracks: number };

	const formatBreakdown = db.prepare(`
		SELECT format, COUNT(*) as count, SUM(file_size) as total_size
		FROM library_tracks
		GROUP BY format
		ORDER BY count DESC
	`).all();

	return json({
		...stats,
		synced_tracks: syncStats.synced_tracks,
		format_breakdown: formatBreakdown,
		playerId
	});
};
