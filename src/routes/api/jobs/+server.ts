import { json } from '@sveltejs/kit';
import db from '$lib/server/db.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ url }) => {
	const limit = parseInt(url.searchParams.get('limit') || '20');
	const status = url.searchParams.get('status');

	let jobs;
	if (status) {
		jobs = db.prepare(`
			SELECT * FROM jobs WHERE status = ?
			ORDER BY started_at DESC
			LIMIT ?
		`).all(status, limit);
	} else {
		jobs = db.prepare(`
			SELECT * FROM jobs
			ORDER BY started_at DESC
			LIMIT ?
		`).all(limit);
	}

	return json({ jobs });
};
