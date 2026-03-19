import { json } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';
import type { RequestHandler } from './$types.js';

// POST /api/players/browse - Browse directories by absolute path
// Used during player setup wizard before a player exists
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const targetPath = body.path;

	if (!targetPath || typeof targetPath !== 'string') {
		return json({ error: 'path is required' }, { status: 400 });
	}

	if (!fs.existsSync(targetPath)) {
		return json({ directories: [] });
	}

	try {
		const entries = fs.readdirSync(targetPath, { withFileTypes: true });
		const directories = entries
			.filter((e) => e.isDirectory())
			.map((e) => ({
				name: e.name,
				path: path.join(targetPath, e.name)
			}))
			.sort((a, b) => a.name.localeCompare(b.name));

		return json({ directories });
	} catch {
		return json({ directories: [] });
	}
};
