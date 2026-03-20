import { json } from '@sveltejs/kit';
import { getSetting, setSetting, isSetupComplete, getManagedDir, getLibraryPath } from '$lib/server/settings.js';
import { getPlayerMountBase } from '$lib/server/players.js';
import { getCronStatus } from '$lib/server/cron.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async () => {
	return json({
		setupComplete: isSetupComplete(),
		managedDir: getManagedDir() || null,
		libraryPath: getLibraryPath(),
		playerMountBase: getPlayerMountBase(),
		cron: getCronStatus()
	});
};

export const PUT: RequestHandler = async ({ request }) => {
	const updates = await request.json();

	for (const [key, value] of Object.entries(updates)) {
		if (typeof value === 'string') {
			setSetting(key, value);
		}
	}

	return json({ success: true });
};
