<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { addToast } from '$lib/stores/toast.svelte.js';
	import { trackJob, onJobComplete, getActiveJobs } from '$lib/stores/sync.svelte.js';

	interface Track {
		id: number;
		title: string;
		artist: string;
		album: string;
		track_number: number | null;
		disc_number: number | null;
		duration: number | null;
		format: string;
		bitrate: number | null;
		file_size: number;
		is_synced: number;
		player_track_id: number | null;
	}

	let tracks = $state<Track[]>([]);
	let loading = $state(true);
	let syncing = $derived(getActiveJobs().some(j => j.type === 'copy' && j.status === 'running'));
	let removing = $derived(getActiveJobs().some(j => j.type === 'remove' && j.status === 'running'));
	let selectedIds = $state<Set<number>>(new Set());
	let albumName = $state('');
	let artistName = $state('');

	function formatDuration(seconds: number | null): string {
		if (!seconds) return '--:--';
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	function formatDurationLong(seconds: number): string {
		const hours = Math.floor(seconds / 3600);
		const mins = Math.floor((seconds % 3600) / 60);
		if (hours > 0) return `${hours}h ${mins}m`;
		return `${mins}m`;
	}

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
	}

	function parseId() {
		const id = decodeURIComponent(page.params.id ?? '');
		const sepIndex = id.indexOf(':');
		if (sepIndex === -1) return { artist: '', album: id };
		return { artist: id.slice(0, sepIndex), album: id.slice(sepIndex + 1) };
	}

	async function loadTracks() {
		loading = true;
		const { artist, album } = parseId();
		artistName = decodeURIComponent(artist);
		albumName = decodeURIComponent(album);

		const params = new URLSearchParams({ album: albumName, artist: artistName });
		const res = await fetch(`/api/library/tracks?${params}`);
		const data = await res.json();
		tracks = data.tracks;
		loading = false;
	}

	function toggleTrack(id: number) {
		const next = new Set(selectedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedIds = next;
	}

	function selectAllUnsynced() {
		selectedIds = new Set(tracks.filter(t => !t.is_synced).map(t => t.id));
	}

	function clearSelection() {
		selectedIds = new Set();
	}

	async function syncSelected() {
		const ids = [...selectedIds];
		if (ids.length === 0) return;
		try {
			const res = await fetch('/api/sync/copy', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ trackIds: ids })
			});
			const data = await res.json();
			if (data.jobId) {
				addToast('success', `Syncing ${data.total} track${data.total > 1 ? 's' : ''}...`);
				trackJob(data.jobId, 'copy', albumName);
				onJobComplete(data.jobId, () => loadTracks());
			}
		} catch {
			addToast('error', 'Sync request failed', 'Could not connect to the server');
		}
		selectedIds = new Set();
	}

	async function syncAll() {
		const ids = tracks.filter(t => !t.is_synced).map(t => t.id);
		if (ids.length === 0) return;
		try {
			const res = await fetch('/api/sync/copy', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ trackIds: ids })
			});
			const data = await res.json();
			if (data.jobId) {
				addToast('success', `Syncing ${data.total} track${data.total > 1 ? 's' : ''}...`);
				trackJob(data.jobId, 'copy', albumName);
				onJobComplete(data.jobId, () => loadTracks());
			}
		} catch {
			addToast('error', 'Sync request failed', 'Could not connect to the server');
		}
	}

	async function removeAlbum() {
		if (syncedCount === 0) return;
		try {
			const res = await fetch('/api/sync/remove', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ artist: artistName, album: albumName })
			});
			const data = await res.json();
			if (data.jobId) {
				addToast('success', `Removing tracks from "${albumName}"...`);
				trackJob(data.jobId, 'remove', albumName);
				onJobComplete(data.jobId, () => loadTracks());
			}
		} catch {
			addToast('error', 'Remove request failed', 'Could not connect to the server');
		}
	}

	function albumGradient(name: string): string {
		let hash = 0;
		for (let i = 0; i < name.length; i++) {
			hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
		}
		const hue = Math.abs(hash) % 360;
		return `linear-gradient(145deg, hsl(${hue}, 35%, 20%), hsl(${(hue + 40) % 360}, 40%, 13%))`;
	}

	let syncedCount = $derived(tracks.filter(t => t.is_synced).length);
	let totalSize = $derived(tracks.reduce((s, t) => s + (t.file_size || 0), 0));
	let totalDuration = $derived(tracks.reduce((s, t) => s + (t.duration || 0), 0));

	onMount(loadTracks);
</script>

<div class="album-page">
	<a href="/library?view=albums" class="back-link">
		<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;display:inline;vertical-align:-2px">
			<path d="M10 3L5 8l5 5"/>
		</svg>
		Albums
	</a>

	{#if loading}
		<div class="loading-state">
			<div class="spinner"></div>
		</div>
	{:else}
		{@const artUrl = `/api/library/art/${encodeURIComponent(artistName + ':' + albumName)}`}

		<!-- Hero header -->
		<header class="album-hero">
			<div class="album-art-large" style="background: {albumGradient(albumName || '?')}">
				<span class="art-letter">{albumName?.charAt(0) || '?'}</span>
				<img
					src={artUrl}
					alt=""
					class="album-art-img"
					onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
				/>
			</div>
			<div class="album-details">
				<h1 class="album-title">{albumName}</h1>
				<p class="album-artist">{artistName}</p>
				<div class="album-meta">
					<span>{tracks.length} tracks</span>
					<span>{formatDurationLong(totalDuration)}</span>
					<span>{formatBytes(totalSize)}</span>
				</div>
				<div class="sync-status">
					{#if syncedCount === tracks.length}
						<span class="sync-pill synced">
							<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:12px;height:12px"><path d="M3 8l3.5 3.5L13 4.5"/></svg>
							Fully synced
						</span>
					{:else if syncedCount > 0}
						<span class="sync-pill partial">{syncedCount}/{tracks.length} synced</span>
					{:else}
						<span class="sync-pill unsynced">Not on player</span>
					{/if}
				</div>
			</div>
		</header>

		<!-- Action bar -->
		<div class="action-bar">
			{#if selectedIds.size > 0}
				<span class="selection-info">{selectedIds.size} selected</span>
				<button class="btn-action" onclick={syncSelected} disabled={syncing}>
					{syncing ? 'Syncing...' : `Sync ${selectedIds.size} tracks`}
				</button>
				<button class="btn-ghost" onclick={clearSelection}>Clear</button>
			{:else}
				{#if syncedCount < tracks.length}
					<button class="btn-action" onclick={syncAll} disabled={syncing}>
						{syncing ? 'Syncing...' : syncedCount > 0 ? 'Sync remaining' : 'Sync all to player'}
					</button>
				{/if}
				{#if tracks.some(t => !t.is_synced)}
					<button class="btn-ghost" onclick={selectAllUnsynced}>Select unsynced</button>
				{/if}
				{#if syncedCount > 0}
					<button class="btn-danger" onclick={removeAlbum} disabled={removing}>
						{removing ? 'Removing...' : 'Remove from player'}
					</button>
				{/if}
			{/if}
		</div>

		<!-- Track list -->
		<div class="track-list">
			{#each tracks as track}
				<div
					class="track-row"
					class:synced={track.is_synced}
					class:selected={selectedIds.has(track.id)}
				>
					<button
						class="track-select"
						class:checked={selectedIds.has(track.id)}
						onclick={() => toggleTrack(track.id)}
						disabled={!!track.is_synced}
					>
						{#if track.is_synced}
							<span class="check-synced">✓</span>
						{:else if selectedIds.has(track.id)}
							<span class="check-on">✓</span>
						{:else}
							<span class="check-off"></span>
						{/if}
					</button>

					<span class="track-num">
						{track.disc_number && track.disc_number > 1 ? `${track.disc_number}-` : ''}{track.track_number || '-'}
					</span>

					<span class="track-title">
						{track.title || 'Unknown Title'}
					</span>

					<span class="track-duration">{formatDuration(track.duration)}</span>

					<span class="track-format">{track.format}</span>

					<span class="track-bitrate">
						{track.bitrate ? `${track.bitrate}k` : ''}
					</span>

					<span class="track-size">{formatBytes(track.file_size)}</span>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.album-page {
		max-width: 900px;
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		color: var(--color-text-muted);
		text-decoration: none;
		font-size: 0.8125rem;
		margin-bottom: 1.75rem;
		transition: color 0.15s;
		font-weight: 500;
	}

	.back-link:hover {
		color: var(--color-accent);
	}

	/* Hero header */
	.album-hero {
		display: flex;
		gap: 1.75rem;
		margin-bottom: 2rem;
	}

	.album-art-large {
		width: 160px;
		height: 160px;
		border-radius: var(--radius-lg);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		box-shadow: var(--shadow-lg);
		overflow: hidden;
		position: relative;
	}

	.art-letter {
		font-family: var(--font-display);
		font-size: 3rem;
		color: rgba(255, 255, 255, 0.5);
		font-weight: 400;
		text-transform: uppercase;
		user-select: none;
	}

	.album-art-img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.album-details {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.375rem;
	}

	.album-title {
		font-family: var(--font-display);
		font-size: 1.75rem;
		font-weight: 400;
		margin: 0;
		letter-spacing: -0.01em;
		line-height: 1.2;
	}

	.album-artist {
		color: var(--color-text-muted);
		font-size: 0.9375rem;
		margin: 0;
		font-weight: 500;
	}

	.album-meta {
		display: flex;
		gap: 0.5rem;
		font-size: 0.8125rem;
		color: var(--color-text-faint);
		margin-top: 0.25rem;
	}

	.album-meta span::after {
		content: '·';
		margin-left: 0.5rem;
	}

	.album-meta span:last-child::after {
		content: '';
	}

	.sync-status {
		margin-top: 0.5rem;
	}

	.sync-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.25rem 0.625rem;
		border-radius: 100px;
	}

	.sync-pill.synced {
		color: var(--color-synced);
		background: rgba(72, 171, 102, 0.1);
	}
	.sync-pill.partial {
		color: var(--color-partial);
		background: rgba(196, 154, 60, 0.1);
	}
	.sync-pill.unsynced {
		color: var(--color-text-faint);
		background: var(--color-surface-raised);
	}

	/* Action bar */
	.action-bar {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		margin-bottom: 1rem;
		min-height: 36px;
	}

	.selection-info {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin-right: 0.25rem;
	}

	.btn-action {
		padding: 0.4375rem 1rem;
		border-radius: var(--radius-md);
		border: none;
		background: var(--color-accent);
		color: #0e0d0b;
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
		font-family: inherit;
		transition: background 0.15s;
	}

	.btn-action:hover:not(:disabled) {
		background: var(--color-accent-hover);
	}

	.btn-action:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-ghost {
		padding: 0.4375rem 0.875rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
		background: transparent;
		color: var(--color-text-muted);
		font-size: 0.8125rem;
		cursor: pointer;
		font-family: inherit;
		transition: all 0.15s;
	}

	.btn-ghost:hover {
		border-color: var(--color-text-faint);
		color: var(--color-text);
	}

	.btn-danger {
		padding: 0.4375rem 1rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-danger);
		background: transparent;
		color: var(--color-danger);
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
		font-family: inherit;
		transition: all 0.15s;
	}

	.btn-danger:hover:not(:disabled) {
		background: var(--color-danger);
		color: #fff;
	}

	.btn-danger:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Track list */
	.track-list {
		background: var(--color-surface);
		border-radius: var(--radius-lg);
		overflow: hidden;
		border: 1px solid var(--color-border-subtle);
	}

	.track-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 1rem;
		border-bottom: 1px solid var(--color-border-subtle);
		font-size: 0.875rem;
		transition: background 0.1s;
	}

	.track-row:last-child {
		border-bottom: none;
	}

	.track-row:hover {
		background: var(--color-surface-hover);
	}

	.track-row.selected {
		background: var(--color-accent-soft);
	}

	.track-row.synced {
		opacity: 0.55;
	}

	.track-row.synced:hover {
		opacity: 0.75;
	}

	/* Selection checkbox */
	.track-select {
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: none;
		cursor: pointer;
		padding: 0;
		flex-shrink: 0;
	}

	.track-select:disabled {
		cursor: default;
	}

	.check-off {
		width: 14px;
		height: 14px;
		border: 1.5px solid var(--color-border);
		border-radius: 3px;
		display: block;
		transition: border-color 0.15s;
	}

	.check-off:hover {
		border-color: var(--color-text-faint);
	}

	.check-on {
		width: 14px;
		height: 14px;
		background: var(--color-accent);
		border-radius: 3px;
		color: #0e0d0b;
		font-size: 0.5625rem;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
	}

	.check-synced {
		color: var(--color-synced);
		font-size: 0.75rem;
	}

	.track-num {
		width: 28px;
		color: var(--color-text-faint);
		font-size: 0.8125rem;
		text-align: right;
		flex-shrink: 0;
	}

	.track-title {
		flex: 1;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: var(--color-text);
		font-weight: 500;
	}

	.track-duration {
		color: var(--color-text-muted);
		font-size: 0.8125rem;
		width: 48px;
		text-align: right;
		flex-shrink: 0;
	}

	.track-format {
		color: var(--color-text-faint);
		font-size: 0.75rem;
		width: 36px;
		text-align: center;
		flex-shrink: 0;
	}

	.track-bitrate {
		color: var(--color-text-faint);
		font-size: 0.75rem;
		width: 36px;
		text-align: right;
		flex-shrink: 0;
	}

	.track-size {
		color: var(--color-text-faint);
		font-size: 0.75rem;
		width: 56px;
		text-align: right;
		flex-shrink: 0;
	}

	/* Loading */
	.loading-state {
		text-align: center;
		padding: 4rem 0;
	}

	.spinner {
		width: 24px;
		height: 24px;
		border: 2px solid var(--color-border);
		border-top-color: var(--color-accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin: 0 auto;
	}

	@keyframes spin { to { transform: rotate(360deg); } }

	@media (max-width: 640px) {
		.album-hero {
			flex-direction: column;
			align-items: center;
			text-align: center;
		}

		.album-art-large {
			width: 140px;
			height: 140px;
		}

		.album-details {
			align-items: center;
		}

		.album-meta {
			justify-content: center;
		}

		.sync-status {
			display: flex;
			justify-content: center;
		}

		.track-format, .track-bitrate {
			display: none;
		}
	}
</style>
