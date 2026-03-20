import db from './db.js';

export function getSetting(key: string): string | undefined {
	const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
	return row?.value;
}

export function setSetting(key: string, value: string): void {
	db.prepare(
		'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
	).run(key, value);
}

export function isSetupComplete(): boolean {
	return getSetting('setup_completed') === 'true';
}

export function getManagedDir(): string | undefined {
	return getSetting('managed_dir');
}

export function getLibraryPath(): string {
	return process.env.LIBRARY_PATH || '/library';
}
