<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { addToast } from '$lib/stores/toast.svelte.js';

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
	let syncing = $state(false);
	let selectedIds = $state<Set<number>>(new Set());
	let albumName = $state('');
	let artistName = $state('');

	function formatDuration(seconds: number | null): string {
		if (!seconds) return '--:--';
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
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
		syncing = true;

		try {
			const res = await fetch('/api/sync/copy', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ trackIds: ids })
			});
			const result = await res.json();

			if (result.failed > 0) {
				const detail = result.errors?.[0] || 'Unknown error';
				addToast('error', `Failed to sync ${result.failed} of ${ids.length} tracks`, detail, 10000);
			}
			if (result.copied > 0) {
				addToast('success', `Synced ${result.copied} track${result.copied > 1 ? 's' : ''} to player`);
			}
		} catch {
			addToast('error', 'Sync request failed', 'Could not connect to the server');
		}

		selectedIds = new Set();
		syncing = false;
		await loadTracks();
	}

	async function syncAll() {
		const ids = tracks.filter(t => !t.is_synced).map(t => t.id);
		if (ids.length === 0) return;
		syncing = true;

		try {
			const res = await fetch('/api/sync/copy', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ trackIds: ids })
			});
			const result = await res.json();

			if (result.failed > 0) {
				const detail = result.errors?.[0] || 'Unknown error';
				addToast('error', `Failed to sync ${result.failed} of ${ids.length} tracks`, detail, 10000);
			}
			if (result.copied > 0) {
				addToast('success', `Synced ${result.copied} track${result.copied > 1 ? 's' : ''} to player`);
			}
		} catch {
			addToast('error', 'Sync request failed', 'Could not connect to the server');
		}

		syncing = false;
		await loadTracks();
	}

	let syncedCount = $derived(tracks.filter(t => t.is_synced).length);
	let totalSize = $derived(tracks.reduce((s, t) => s + (t.file_size || 0), 0));
	let totalDuration = $derived(tracks.reduce((s, t) => s + (t.duration || 0), 0));

	onMount(loadTracks);
</script>

<div class="album-page">
	<a href="/library" class="back-link">← Library</a>

	{#if loading}
		<div class="loading-state">
			<div class="spinner"></div>
		</div>
	{:else}
		<header class="album-header">
			<div class="album-art-large">
				<span>{albumName?.charAt(0) || '?'}</span>
			</div>
			<div class="album-details">
				<h1>{albumName}</h1>
				<p class="album-artist-name">{artistName}</p>
				<div class="album-meta">
					<span>{tracks.length} tracks</span>
					<span>{formatDuration(totalDuration)}</span>
					<span>{formatBytes(totalSize)}</span>
				</div>
				<div class="sync-status-bar">
					{#if syncedCount === tracks.length}
						<span class="sync-indicator synced">✓ Fully synced</span>
					{:else if syncedCount > 0}
						<span class="sync-indicator partial">◐ {syncedCount}/{tracks.length} synced</span>
					{:else}
						<span class="sync-indicator unsynced">Not on player</span>
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
				<button class="btn-action-ghost" onclick={clearSelection}>Clear</button>
			{:else}
				{#if syncedCount < tracks.length}
					<button class="btn-action" onclick={syncAll} disabled={syncing}>
						{syncing ? 'Syncing...' : syncedCount > 0 ? 'Sync remaining' : 'Sync all to player'}
					</button>
				{/if}
				{#if tracks.some(t => !t.is_synced)}
					<button class="btn-action-ghost" onclick={selectAllUnsynced}>Select unsynced</button>
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
		display: inline-block;
		color: var(--color-text-muted);
		text-decoration: none;
		font-size: 0.8125rem;
		margin-bottom: 1.5rem;
		transition: color 0.15s;
	}

	.back-link:hover {
		color: var(--color-accent);
	}

	/* Album header */
	.album-header {
		display: flex;
		gap: 1.5rem;
		margin-bottom: 1.75rem;
	}

	.album-art-large {
		width: 120px;
		height: 120px;
		border-radius: 6px;
		background: var(--color-surface);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.album-art-large span {
		font-family: var(--font-display);
		font-size: 2.5rem;
		color: var(--color-text-faint);
	}

	.album-details {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.25rem;
	}

	.album-details h1 {
		font-family: var(--font-display);
		font-size: 1.5rem;
		font-weight: 400;
		margin: 0;
	}

	.album-artist-name {
		color: var(--color-text-muted);
		font-size: 0.9375rem;
		margin: 0;
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

	.sync-status-bar {
		margin-top: 0.375rem;
	}

	.sync-indicator {
		font-size: 0.8125rem;
		font-weight: 500;
	}

	.sync-indicator.synced { color: var(--color-synced); }
	.sync-indicator.partial { color: var(--color-partial); }
	.sync-indicator.unsynced { color: var(--color-text-faint); }

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
		padding: 0.375rem 0.875rem;
		border-radius: 5px;
		border: none;
		background: var(--color-accent);
		color: #1a1815;
		font-size: 0.8125rem;
		font-weight: 500;
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

	.btn-action-ghost {
		padding: 0.375rem 0.75rem;
		border-radius: 5px;
		border: 1px solid var(--color-border);
		background: transparent;
		color: var(--color-text-muted);
		font-size: 0.8125rem;
		cursor: pointer;
		font-family: inherit;
	}

	.btn-action-ghost:hover {
		border-color: var(--color-text-faint);
		color: var(--color-text);
	}

	/* Track list */
	.track-list {
		background: var(--color-surface);
		border-radius: 8px;
		overflow: hidden;
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
		background: var(--color-surface-raised);
	}

	.track-row.selected {
		background: rgba(212, 168, 67, 0.06);
	}

	.track-row.synced {
		opacity: 0.7;
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
		width: 16px;
		height: 16px;
		border: 1.5px solid var(--color-border);
		border-radius: 3px;
		display: block;
	}

	.check-on {
		width: 16px;
		height: 16px;
		background: var(--color-accent);
		border-radius: 3px;
		color: #1a1815;
		font-size: 0.625rem;
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
		.album-header {
			flex-direction: column;
			align-items: center;
			text-align: center;
		}

		.album-meta {
			justify-content: center;
		}

		.track-format, .track-bitrate {
			display: none;
		}
	}
</style>
