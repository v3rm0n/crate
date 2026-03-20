import db from '$lib/server/db.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = ({ params }) => {
	const id = decodeURIComponent(params.id);
	const art = db
		.prepare('SELECT data, mime_type FROM album_art WHERE id = ?')
		.get(id) as { data: Buffer; mime_type: string } | undefined;

	if (!art) {
		return new Response(null, { status: 404 });
	}

	return new Response(art.data, {
		headers: {
			'Content-Type': art.mime_type,
			'Cache-Control': 'public, max-age=31536000, immutable',
			ETag: `"${encodeURIComponent(id)}"`,
		}
	});
};
