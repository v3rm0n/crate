import { getPlayers, getActivePlayer, type PlayerWithStats } from '$lib/server/players.js';
import db from '$lib/server/db.js';
import type { LayoutServerLoad } from './$types.js';

export const load: LayoutServerLoad = async () => {
	const players = getPlayers();
	const activePlayerBasic = getActivePlayer();
	
	// Get active player with stats if exists
	let activePlayer: PlayerWithStats | null = null;
	if (activePlayerBasic) {
		const playerWithStats = players.find(p => p.id === activePlayerBasic.id);
		activePlayer = playerWithStats ?? null;
	}

	return {
		players,
		activePlayer
	};
};