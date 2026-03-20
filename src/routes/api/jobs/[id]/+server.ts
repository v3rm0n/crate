import { json } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ params }) => {
	const id = parseInt(params.id);
	if (isNaN(id)) {
		return json({ error: 'Invalid job ID' }, { status: 400 });
	}

	const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
	if (!job) {
		return json({ error: 'Job not found' }, { status: 404 });
	}

	return json({ job });
};
