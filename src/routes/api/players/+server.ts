import { json } from '@sveltejs/kit';
import {
	discoverPlayers,
	getPlayers,
	getActivePlayer,
	createPlayer,
	updatePlayer,
	setActivePlayer,
	deletePlayer,
	setPlayerMountBase,
	getPlayerMountBase,
	listPlayerDirectories,
	type PlayerWithStats
} from '$lib/server/players.js';
import { createLogger } from '$lib/server/logger.js';
import type { RequestHandler } from './$types.js';

const log = createLogger('api:players');

// GET /api/players - List all players and discovered devices
export const GET: RequestHandler = async () => {
	const players = getPlayers();
	const discovered = discoverPlayers();
	const activePlayer = getActivePlayer();
	const mountBase = getPlayerMountBase();

	return json({
		players,
		discovered,
		activePlayer,
		mountBase
	});
};

// POST /api/players - Create a new player or update mount base
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();

	// Handle mount base update
	if (body.mountBase !== undefined) {
		setPlayerMountBase(body.mountBase);
		log.info('Updated player mount base', { mountBase: body.mountBase });
		return json({ success: true, mountBase: body.mountBase });
	}

	// Handle player creation
	const { name, mountPath, managedDir } = body;

	if (!name || !mountPath) {
		return json({ error: 'Name and mountPath are required' }, { status: 400 });
	}

	try {
		const player = createPlayer(name, mountPath, managedDir || '');
		log.info('Created player via API', { playerId: player.id, name, mountPath });
		return json({ success: true, player });
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : 'Unknown error';
		log.error('Failed to create player', { name, mountPath, error: errorMsg });
		return json({ error: errorMsg }, { status: 500 });
	}
};
