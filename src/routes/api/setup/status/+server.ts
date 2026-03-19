import { json } from '@sveltejs/kit';
import { isSetupComplete } from '$lib/server/settings.js';
import { getPlayers, getActivePlayer } from '$lib/server/players.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async () => {
	const players = getPlayers();
	const activePlayer = getActivePlayer();

	return json({
		setupComplete: isSetupComplete(),
		players,
		activePlayer: activePlayer || null
	});
};
