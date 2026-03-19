import { json } from '@sveltejs/kit';
import { setSetting } from '$lib/server/settings.js';
import { createPlayer, getPlayerManagedPath } from '$lib/server/players.js';
import { planMigration, executeMigration } from '$lib/server/migrate.js';
import { scanLibrary } from '$lib/server/scanner.js';
import { scanPlayer } from '$lib/server/player.js';
import { createLogger } from '$lib/server/logger.js';
import fs from 'node:fs';
import path from 'node:path';
import type { RequestHandler } from './$types.js';

const log = createLogger('setup');

export const POST: RequestHandler = async ({ request }) => {
	const { name, mountPath, managedDir } = await request.json();
	log.info('Setup initialization started', { name, mountPath, managedDir });

	if (!name || !mountPath) {
		log.error('Setup failed: missing required fields');
		return json({ error: 'Name and mount path are required' }, { status: 400 });
	}

	if (!fs.existsSync(mountPath)) {
		log.error('Setup failed: mount path does not exist', { mountPath });
		return json({ error: 'Mount path does not exist' }, { status: 400 });
	}

	// Create the player
	const player = createPlayer(name, mountPath, managedDir || '');
	const playerId = player.id;
	log.info('Player created', { playerId, name, mountPath, managedDir });

	const managedPath = getPlayerManagedPath(playerId);
	if (!managedPath) {
		log.error('Setup failed: could not get managed path');
		return json({ error: 'Failed to get managed path' }, { status: 500 });
	}

	// Create managed directory if it doesn't exist
	if (!fs.existsSync(managedPath)) {
		log.info('Creating managed directory', { managedPath });
		fs.mkdirSync(managedPath, { recursive: true });
	}

	log.info('Planning migration', { managedPath });
	const plan = await planMigration(managedPath);
	log.info('Migration plan created', {
		moves: plan.moves.length,
		unsorted: plan.unsorted.length,
		alreadyCorrect: plan.alreadyCorrect.length
	});

	let migrationResult = null;
	if (plan.moves.length > 0 || plan.unsorted.length > 0) {
		log.info('Executing migration');
		migrationResult = await executeMigration(managedPath, plan);
		log.info('Migration completed', {
			moved: migrationResult.moved,
			unsorted: migrationResult.unsorted,
			errors: migrationResult.errors.length
		});
	} else {
		log.info('No migration needed');
	}

	log.info('Running initial library scan');
	await scanLibrary();

	log.info('Running initial player scan', { playerId });
	await scanPlayer(playerId);

	setSetting('setup_completed', 'true');
	log.info('Setup completed successfully');

	return json({
		success: true,
		player,
		migration: migrationResult
			? {
					moved: migrationResult.moved,
					unsorted: migrationResult.unsorted,
					errors: migrationResult.errors
				}
			: null
	});
};
