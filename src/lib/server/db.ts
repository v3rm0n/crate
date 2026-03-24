import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { createLogger } from './logger.js';

const log = createLogger('db');

let _db: Database.Database | null = null;

function getDb(): Database.Database {
	if (_db) return _db;

	const dataDir = process.env.DATA_DIR || '/data';
	const dbPath = path.join(dataDir, 'crate.db');

	log.info('Initializing database', { dataDir, dbPath });

	// Ensure data directory exists
	if (!fs.existsSync(dataDir)) {
		log.info('Creating data directory', { dataDir });
		fs.mkdirSync(dataDir, { recursive: true });
	}

	_db = new Database(dbPath);

	// Enable WAL mode for better concurrent read performance
	_db.pragma('journal_mode = WAL');
	_db.pragma('foreign_keys = ON');

	// Run migrations
	migrate(_db);

	log.info('Database initialized successfully', { dbPath });

	return _db;
}

function migrate(db: Database.Database): void {
	log.info('Running database migrations');
	db.exec(`
		CREATE TABLE IF NOT EXISTS settings (
			key   TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS library_tracks (
			id            INTEGER PRIMARY KEY AUTOINCREMENT,
			relative_path TEXT NOT NULL UNIQUE,
			title         TEXT,
			artist        TEXT,
			album         TEXT,
			album_artist  TEXT,
			genre         TEXT,
			track_number  INTEGER,
			disc_number   INTEGER,
			year          INTEGER,
			duration      REAL,
			format        TEXT,
			bitrate       INTEGER,
			sample_rate   INTEGER,
			file_size     INTEGER,
			last_modified INTEGER,
			scanned_at    TEXT NOT NULL DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS players (
			id           INTEGER PRIMARY KEY AUTOINCREMENT,
			name         TEXT NOT NULL,
			mount_path   TEXT NOT NULL,
			managed_dir  TEXT NOT NULL DEFAULT '',
			is_active    INTEGER NOT NULL DEFAULT 0,
			created_at   TEXT NOT NULL DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS player_tracks (
			id               INTEGER PRIMARY KEY AUTOINCREMENT,
			player_id        INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
			relative_path    TEXT NOT NULL,
			library_track_id INTEGER REFERENCES library_tracks(id) ON DELETE SET NULL,
			file_size        INTEGER,
			is_orphan        INTEGER NOT NULL DEFAULT 0,
			synced_at        TEXT NOT NULL DEFAULT (datetime('now')),
			UNIQUE(player_id, relative_path)
		);

		CREATE TABLE IF NOT EXISTS jobs (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			type        TEXT NOT NULL,
			status      TEXT NOT NULL DEFAULT 'running',
			progress    INTEGER NOT NULL DEFAULT 0,
			total       INTEGER NOT NULL DEFAULT 0,
			started_at  TEXT NOT NULL DEFAULT (datetime('now')),
			finished_at TEXT,
			error       TEXT,
			player_id   INTEGER REFERENCES players(id) ON DELETE SET NULL
		);

		CREATE TABLE IF NOT EXISTS album_art (
			id        TEXT PRIMARY KEY,
			data      BLOB NOT NULL,
			mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);

		CREATE INDEX IF NOT EXISTS idx_library_tracks_artist ON library_tracks(artist);
		CREATE INDEX IF NOT EXISTS idx_library_tracks_album ON library_tracks(album);
		CREATE INDEX IF NOT EXISTS idx_library_tracks_album_artist ON library_tracks(album_artist);
		CREATE INDEX IF NOT EXISTS idx_library_tracks_genre ON library_tracks(genre);
		CREATE INDEX IF NOT EXISTS idx_player_tracks_player_id ON player_tracks(player_id);
		CREATE INDEX IF NOT EXISTS idx_player_tracks_library_track_id ON player_tracks(library_track_id);
		CREATE INDEX IF NOT EXISTS idx_jobs_player_id ON jobs(player_id);
		CREATE INDEX IF NOT EXISTS idx_players_is_active ON players(is_active);
	`);

	// Add alias column to players table if missing
	const hasAliasColumn = db.prepare(`
		SELECT 1 FROM pragma_table_info('players') WHERE name = 'alias'
	`).get();
	if (!hasAliasColumn) {
		db.exec("ALTER TABLE players ADD COLUMN alias TEXT NOT NULL DEFAULT ''");
		log.info('Added alias column to players table');
	}

	// Run data migrations
	migrateData(db);
}

function migrateData(db: Database.Database): void {
	// Add result column to jobs table if missing
	const hasResultColumn = db.prepare(`
		SELECT 1 FROM pragma_table_info('jobs') WHERE name = 'result'
	`).get();
	if (!hasResultColumn) {
		db.exec('ALTER TABLE jobs ADD COLUMN result TEXT');
		log.info('Added result column to jobs table');
	}

	// Check if we need to migrate from single-player to multi-player schema
	const hasPlayerIdColumn = db.prepare(`
		SELECT 1 FROM pragma_table_info('player_tracks') WHERE name = 'player_id'
	`).get();

	if (!hasPlayerIdColumn) {
		log.info('Migrating from single-player to multi-player schema');

		// Create temporary table with new schema
		db.exec(`
			CREATE TABLE player_tracks_new (
				id               INTEGER PRIMARY KEY AUTOINCREMENT,
				player_id        INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
				relative_path    TEXT NOT NULL,
				library_track_id INTEGER REFERENCES library_tracks(id) ON DELETE SET NULL,
				file_size        INTEGER,
				is_orphan        INTEGER NOT NULL DEFAULT 0,
				synced_at        TEXT NOT NULL DEFAULT (datetime('now')),
				UNIQUE(player_id, relative_path)
			);

			CREATE INDEX idx_player_tracks_player_id_new ON player_tracks_new(player_id);
			CREATE INDEX idx_player_tracks_library_track_id_new ON player_tracks_new(library_track_id);
		`);

		// Check if we have existing player tracks to migrate
		const existingTracks = db.prepare('SELECT COUNT(*) as count FROM player_tracks').get() as { count: number };

		if (existingTracks.count > 0) {
			// Get the legacy settings to create a default player
			const managedDir = db.prepare("SELECT value FROM settings WHERE key = 'managed_dir'").get() as { value: string } | undefined;
			const playerPath = process.env.PLAYER_MOUNT_BASE || '/player';

			// Create default player from legacy settings
			const result = db.prepare(`
				INSERT INTO players (name, mount_path, managed_dir, is_active)
				VALUES (?, ?, ?, 1)
			`).run('Default Player', playerPath, managedDir?.value || '');

			const defaultPlayerId = result.lastInsertRowid;
			log.info('Created default player from legacy settings', { playerId: defaultPlayerId, mountPath: playerPath, managedDir: managedDir?.value });

			// Migrate existing tracks to use the default player
			db.prepare(`
				INSERT INTO player_tracks_new (player_id, relative_path, library_track_id, file_size, is_orphan, synced_at)
				SELECT ?, relative_path, library_track_id, file_size, is_orphan, synced_at
				FROM player_tracks
			`).run(defaultPlayerId);

			log.info('Migrated existing tracks to default player', { count: existingTracks.count });
		}

		// Replace old table with new one
		db.exec(`
			DROP TABLE player_tracks;
			ALTER TABLE player_tracks_new RENAME TO player_tracks;
		`);

		log.info('Migration to multi-player schema completed');
	}
}

// Proxy that lazily initializes the database on first access
const db = new Proxy({} as Database.Database, {
	get(_target, prop: string | symbol) {
		const instance = getDb();
		const value = instance[prop as keyof Database.Database];
		if (typeof value === 'function') {
			return value.bind(instance);
		}
		return value;
	}
});

export default db;
