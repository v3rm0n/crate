import db from './db.js';
import { scanLibrary } from './scanner.js';
import { scanPlayer } from './player.js';
import { isSetupComplete } from './settings.js';
import { getActivePlayer, getPlayers } from './players.js';
import { createLogger } from './logger.js';

const log = createLogger('cron');

let intervalId: ReturnType<typeof setInterval> | null = null;
let running = false;
let lastRunAt: Date | null = null;
let lastRunStatus: 'success' | 'failed' | null = null;
let lastRunError: string | null = null;

/**
 * Parse SCAN_INTERVAL env var. Returns interval in milliseconds, or 0 if disabled.
 * Accepts minutes as a number (e.g. "60" = every hour).
 */
function getIntervalMs(): number {
	const raw = process.env.SCAN_INTERVAL;
	if (!raw) return 0;
	const minutes = parseInt(raw, 10);
	if (isNaN(minutes) || minutes <= 0) return 0;
	return minutes * 60 * 1000;
}

/**
 * Run a full scan cycle: library scan, then scan all players.
 * Skips if a scan is already in progress or setup isn't complete.
 */
async function runScanCycle(): Promise<void> {
	if (running) {
		log.info('Skipping scheduled scan — previous scan still running');
		return;
	}

	if (!isSetupComplete()) {
		log.info('Skipping scheduled scan — setup not complete');
		return;
	}

	running = true;
	const startTime = Date.now();
	log.info('Starting scheduled scan cycle');

	try {
		// Scan library first
		await scanLibrary();

		// Get all players and scan each one
		const players = getPlayers();
		if (players.length === 0) {
			log.info('No players configured, skipping player scans');
		} else {
			for (const player of players) {
				log.info('Scanning player', { playerId: player.id, name: player.name });
				await scanPlayer(player.id);
			}
		}

		const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
		log.info('Scheduled scan cycle completed', { durationSec, playersScanned: players.length });
		lastRunStatus = 'success';
		lastRunError = null;
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		log.error('Scheduled scan cycle failed', { error: errorMsg });
		lastRunStatus = 'failed';
		lastRunError = errorMsg;
	} finally {
		running = false;
		lastRunAt = new Date();
	}
}

/**
 * Start the periodic scan cron. No-op if SCAN_INTERVAL is unset or 0.
 */
export function startCron(): void {
	const intervalMs = getIntervalMs();

	if (intervalMs === 0) {
		log.info('Periodic scanning disabled (SCAN_INTERVAL not set or 0)');
		return;
	}

	const intervalMin = intervalMs / 60000;
	log.info('Starting periodic scan', { intervalMinutes: intervalMin });

	// Run the first scan shortly after startup (30s delay to let server settle)
	setTimeout(() => {
		runScanCycle();
	}, 30_000);

	intervalId = setInterval(() => {
		runScanCycle();
	}, intervalMs);
}

/**
 * Stop the periodic scan cron.
 */
export function stopCron(): void {
	if (intervalId) {
		clearInterval(intervalId);
		intervalId = null;
		log.info('Periodic scanning stopped');
	}
}

/**
 * Get the current cron status for the settings API.
 */
export function getCronStatus(): {
	enabled: boolean;
	intervalMinutes: number;
	running: boolean;
	lastRunAt: string | null;
	lastRunStatus: string | null;
	lastRunError: string | null;
	nextRunAt: string | null;
	playerCount: number;
} {
	const intervalMs = getIntervalMs();
	const intervalMinutes = intervalMs / 60000;
	const players = getPlayers();

	let nextRunAt: string | null = null;
	if (intervalMs > 0 && lastRunAt) {
		nextRunAt = new Date(lastRunAt.getTime() + intervalMs).toISOString();
	} else if (intervalMs > 0 && !lastRunAt) {
		// First run is 30s after startup — approximate
		nextRunAt = 'pending';
	}

	return {
		enabled: intervalMs > 0,
		intervalMinutes,
		running,
		lastRunAt: lastRunAt?.toISOString() ?? null,
		lastRunStatus,
		lastRunError,
		nextRunAt,
		playerCount: players.length
	};
}
