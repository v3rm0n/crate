import { redirect } from '@sveltejs/kit';
import { isSetupComplete, getLibraryPath } from '$lib/server/settings.js';
import { getPlayerMountBase } from '$lib/server/players.js';
import { createLogger } from '$lib/server/logger.js';
import { startCron } from '$lib/server/cron.js';
import type { Handle } from '@sveltejs/kit';
import fs from 'node:fs';

const log = createLogger('server');

// Log startup configuration on first import
const libraryPath = getLibraryPath();
const playerMountBase = getPlayerMountBase();

log.info('Crate starting', {
	nodeEnv: process.env.NODE_ENV,
	libraryPath,
	playerMountBase,
	dataDir: process.env.DATA_DIR || '/data'
});

// Check mount points at startup
if (!fs.existsSync(libraryPath)) {
	log.warn('Library path does not exist at startup', { libraryPath });
} else {
	try {
		const entries = fs.readdirSync(libraryPath);
		if (entries.length === 0) {
			log.warn('Library directory exists but is EMPTY — volume mount may not be working', { libraryPath });
		} else {
			log.info('Library directory accessible', { libraryPath, entryCount: entries.length });
		}
	} catch (err) {
		log.error('Cannot read library directory', { libraryPath, error: err instanceof Error ? err.message : String(err) });
	}
}

if (!fs.existsSync(playerMountBase)) {
	log.warn('Player mount base does not exist at startup', { playerMountBase });
} else {
	try {
		const entries = fs.readdirSync(playerMountBase);
		log.info('Player mount base accessible', { playerMountBase, entryCount: entries.length, entries: entries.slice(0, 10) });
	} catch (err) {
		log.error('Cannot read player mount base', { playerMountBase, error: err instanceof Error ? err.message : String(err) });
	}
}

// Start periodic scan cron if configured
startCron();

export const handle: Handle = async ({ event, resolve }) => {
	// Redirect to setup if not completed (except for setup routes and API)
	if (
		!event.url.pathname.startsWith('/setup') &&
		!event.url.pathname.startsWith('/api') &&
		!isSetupComplete()
	) {
		log.info('Redirecting to setup — setup not complete', { path: event.url.pathname });
		throw redirect(302, '/setup');
	}

	return resolve(event);
};
