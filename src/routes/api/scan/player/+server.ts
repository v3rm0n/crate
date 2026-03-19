import { scanPlayer } from '$lib/server/player.js';
import { getActivePlayerId } from '$lib/server/players.js';
import { createLogger } from '$lib/server/logger.js';
import type { RequestHandler } from './$types.js';

const log = createLogger('api:scan:player');

export const GET: RequestHandler = async ({ url }) => {
	const playerIdParam = url.searchParams.get('player_id');
	const playerId = playerIdParam ? parseInt(playerIdParam, 10) : getActivePlayerId();

	if (!playerId) {
		return new Response(JSON.stringify({ error: 'No player specified and no active player' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	log.info('Player scan requested via API', { playerId });

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			scanPlayer(playerId, (progress) => {
				const data = `data: ${JSON.stringify(progress)}\n\n`;
				try {
					controller.enqueue(encoder.encode(data));
				} catch (err) {
					log.warn('Failed to enqueue SSE data (client may have disconnected)', {
						phase: progress.phase,
						error: err instanceof Error ? err.message : String(err)
					});
					return;
				}
				if (progress.phase === 'complete' || progress.phase === 'error') {
					log.info('Player scan SSE stream closing', { phase: progress.phase, total: progress.total });
					try {
						controller.close();
					} catch {
						// Stream already closed
					}
				}
			}).catch((err) => {
				log.error('Player scan threw unhandled error', { error: err instanceof Error ? err.message : String(err) });
				try {
					const errorData = `data: ${JSON.stringify({ phase: 'error', current: 0, total: 0, error: 'Internal scan error' })}\n\n`;
					controller.enqueue(encoder.encode(errorData));
					controller.close();
				} catch {
					// Stream already closed
				}
			});
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
