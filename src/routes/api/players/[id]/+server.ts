import { json } from '@sveltejs/kit';
import {
	getPlayer,
	updatePlayer,
	setActivePlayer,
	deletePlayer,
	listPlayerDirectories
} from '$lib/server/players.js';
import { createLogger } from '$lib/server/logger.js';
import type { RequestHandler } from './$types.js';

const log = createLogger('api:player');

// GET /api/players/[id] - Get a specific player
export const GET: RequestHandler = async ({ params }) => {
	const id = parseInt(params.id, 10);
	if (isNaN(id)) {
		return json({ error: 'Invalid player ID' }, { status: 400 });
	}

	const player = getPlayer(id);
	if (!player) {
		return json({ error: 'Player not found' }, { status: 404 });
	}

	return json({ player });
};

// PATCH /api/players/[id] - Update a player
export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = parseInt(params.id, 10);
	if (isNaN(id)) {
		return json({ error: 'Invalid player ID' }, { status: 400 });
	}

	const body = await request.json();

	// Handle activation
	if (body.action === 'activate') {
		const success = setActivePlayer(id);
		if (!success) {
			return json({ error: 'Player not found' }, { status: 404 });
		}
		log.info('Activated player via API', { playerId: id });
		return json({ success: true });
	}

	// Handle update
	const { name, alias, managed_dir } = body;
	const updates: Partial<{ name: string; alias: string; managed_dir: string }> = {};
	if (name !== undefined) updates.name = name;
	if (alias !== undefined) updates.alias = alias;
	if (managed_dir !== undefined) updates.managed_dir = managed_dir;

	const player = updatePlayer(id, updates);
	if (!player) {
		return json({ error: 'Player not found' }, { status: 404 });
	}

	log.info('Updated player via API', { playerId: id, updates });
	return json({ success: true, player });
};

// DELETE /api/players/[id] - Delete a player
export const DELETE: RequestHandler = async ({ params }) => {
	const id = parseInt(params.id, 10);
	if (isNaN(id)) {
		return json({ error: 'Invalid player ID' }, { status: 400 });
	}

	const success = deletePlayer(id);
	if (!success) {
		return json({ error: 'Player not found' }, { status: 404 });
	}

	log.info('Deleted player via API', { playerId: id });
	return json({ success: true });
};

// POST /api/players/[id]/directories - List directories within a player's mount
export const POST: RequestHandler = async ({ params, request }) => {
	const id = parseInt(params.id, 10);
	if (isNaN(id)) {
		return json({ error: 'Invalid player ID' }, { status: 400 });
	}

	const body = await request.json();
	const subPath = body.path || undefined;

	const directories = listPlayerDirectories(id, subPath);
	return json({ directories });
};
