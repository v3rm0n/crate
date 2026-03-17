# Rockbox Web Manager

[![Build](https://github.com/v3rm0n/rockbox-web/actions/workflows/build.yml/badge.svg)](https://github.com/v3rm0n/rockbox-web/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Docker Image](https://img.shields.io/badge/ghcr.io-v3rm0n%2Frockbox--web-blue)](https://github.com/v3rm0n/rockbox-web/pkgs/container/rockbox-web)

A web application for managing music on [Rockbox](https://www.rockbox.org/) media players. Runs as a Docker container on your NAS (Unraid, Synology, etc.), mounts your music library and player storage, and lets you browse, search, and sync music through a clean web interface.

## Features

- **Library browser** — browse your music library by artist and album with search
- **Sync status tracking** — instantly see which albums are fully synced, partially synced, or not on the player
- **Manual sync** — copy individual tracks or entire albums to the player with one click
- **Player browser** — view and manage what's on the player, remove tracks
- **Storage dashboard** — monitor player storage usage, top artists by size
- **First-run setup wizard** — pick or create a managed directory on the player, auto-migrate existing files
- **Incremental scanning** — only re-processes changed files on rescan
- **Orphan detection** — flags files on the player that don't match anything in the library

## How it works

```
NAS                              Docker Container                    Player
┌──────────────┐                ┌──────────────────┐              ┌──────────┐
│ Music Library │──── /library ─│  Rockbox Web App  │── /player ──│  Rockbox │
│ (Lidarr, etc.)│   (read-only) │  SvelteKit + SQLite│ (read-write)│  Device  │
└──────────────┘                └──────────────────┘              └──────────┘
```

The app expects a well-structured music library (e.g. managed by [Lidarr](https://lidarr.audio/)) and mirrors that structure on the player. File matching is done by relative path — if `/library/Artist/Album/01 - Song.flac` exists and the same path exists under the managed directory on the player, it's considered synced.

## Quick start

Pull the image from GitHub Container Registry:

```sh
docker pull ghcr.io/v3rm0n/rockbox-web:latest
```

### Docker Compose

```yaml
services:
  rockbox-web:
    image: ghcr.io/v3rm0n/rockbox-web:latest
    container_name: rockbox-web
    ports:
      - "3000:3000"
    volumes:
      - rockbox-data:/data
      - /path/to/your/music/library:/library:ro
      - /path/to/your/player:/player
    environment:
      - ORIGIN=http://localhost:3000
    restart: unless-stopped

volumes:
  rockbox-data:
```

Replace `/path/to/your/music/library` with your NAS music share and `/path/to/your/player` with the mounted Rockbox player storage.

```sh
docker compose up -d
```

Open `http://your-nas-ip:3000` and follow the setup wizard.

### Docker run

```sh
docker run -d \
  --name rockbox-web \
  -p 3000:3000 \
  -v rockbox-data:/data \
  -v /path/to/your/music/library:/library:ro \
  -v /path/to/your/player:/player \
  -e ORIGIN=http://localhost:3000 \
  ghcr.io/v3rm0n/rockbox-web:latest
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `ORIGIN` | `http://localhost:3000` | The public URL of the app (required for CSRF protection) |
| `DATA_DIR` | `/data` | Where the SQLite database is stored |
| `LIBRARY_PATH` | `/library` | Mount point for the music library |
| `PLAYER_PATH` | `/player` | Mount point for the player storage |
| `PORT` | `3000` | HTTP server port |

## Supported audio formats

FLAC, MP3, OGG, AAC, WAV

## First-run setup

On first launch, the setup wizard will:

1. Let you choose or create a directory on the player to manage (e.g. `Music`)
2. Scan existing files in that directory and reorganize them to match your library's folder structure (Artist/Album/Track)
3. Move files with unreadable metadata to an `Unsorted` folder
4. Scan your music library and index all tracks

## Development

```sh
npm install
npm run dev
```

Requires local directories for testing:

```sh
mkdir -p /tmp/rockbox-test/{library,player,data}

DATA_DIR=/tmp/rockbox-test/data \
LIBRARY_PATH=/tmp/rockbox-test/library \
PLAYER_PATH=/tmp/rockbox-test/player \
npm run dev
```

### Production build

```sh
npm run build
node build
```

## Tech stack

- [SvelteKit](https://svelte.dev/) — full-stack framework
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — embedded database
- [music-metadata](https://github.com/borewit/music-metadata) — audio file metadata parsing
- Node.js 22 Alpine — Docker base image

## License

[MIT](LICENSE)
