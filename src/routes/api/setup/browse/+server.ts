import { json } from '@sveltejs/kit';
import { discoverPlayers, getPlayerMountBase } from '$lib/server/players.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async () => {
	const players = discoverPlayers();
	return json({
		directories: players,
		mountBase: getPlayerMountBase()
	});
};
