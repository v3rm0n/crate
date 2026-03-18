<script lang="ts">
	import { onMount } from 'svelte';

	interface Track {
		id: number;
		relative_path: string;
		title: string | null;
		artist: string | null;
		album: string | null;
		album_artist: string | null;
		genre: string | null;
		track_number: number | null;
		disc_number: number | null;
		year: number | null;
		duration: number | null;
		format: string | null;
		bitrate: number | null;
		sample_rate: number | null;
		file_size: number;
		is_synced: number;
		player_track_id: number | null;
	}

	let tracks = $state<Track[]>([]);
	let searchQuery = $state('');
	let syncFilter = $state('all');
	let sortBy = $state('artist');
	let sortOrder = $state<'asc' | 'desc'>('asc');
	let currentPage = $state(1);
	let totalPages = $state(1);
	let total = $state(0);
	let loading = $state(true);
	let selectedIds = $state<Set<number>>(new Set());
	let syncing = $state(false);

	function formatDuration(seconds: number | null): string {
		if (!seconds) return '--:--';
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	function formatQuality(track: Track): string {
		const parts: string[] = [];
		if (track.format) parts.push(track.format);
		if (track.bitrate) parts.push(`${track.bitrate}k`);
		return parts.join(' ') || '-';
	}

	async function loadTracks() {
		loading = true;
		const params = new URLSearchParams();
		params.set('page', String(currentPage));
		params.set('limit', '100');
		params.set('sort', sortBy);
		params.set('order', sortOrder);
		if (searchQuery) params.set('q', searchQuery);
		if (syncFilter !== 'all') params.set('sync', syncFilter);

		const res = await fetch(`/api/library/tracks?${params}`);
		const data = await res.json();
		tracks = data.tracks;
		totalPages = data.pagination.pages;
		total = data.pagination.total;
		loading = false;
	}

	function toggleSort(column: string) {
		if (sortBy === column) {
			sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			sortBy = column;
			sortOrder = 'asc';
		}
		currentPage = 1;
		loadTracks();
	}

	function setFilter(filter: string) {
		syncFilter = filter;
		currentPage = 1;
		loadTracks();
	}

	let searchTimeout: ReturnType<typeof setTimeout>;
	function onSearchInput() {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			currentPage = 1;
			loadTracks();
		}, 300);
	}

	function toggleTrack(id: number) {
		const next = new Set(selectedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedIds = next;
	}

	function toggleAll() {
		if (selectedIds.size === unsyncedOnPage.length) {
			selectedIds = new Set();
		} else {
			selectedIds = new Set(unsyncedOnPage.map(t => t.id));
		}
	}

	async function syncSelected() {
		const ids = [...selectedIds];
		if (ids.length === 0) return;
		syncing = true;

		await fetch('/api/sync/copy', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ trackIds: ids })
		});

		selectedIds = new Set();
		syncing = false;
		await loadTracks();
	}

	let unsyncedOnPage = $derived(tracks.filter(t => !t.is_synced));
	let allUnsyncedSelected = $derived(
		unsyncedOnPage.length > 0 && unsyncedOnPage.every(t => selectedIds.has(t.id))
	);

	onMount(loadTracks);
</script>

<div class="library-page">
	<header class="page-header">
		<div class="header-row">
			<h1>Library</h1>
			{#if !loading}
				<span class="header-count">{total.toLocaleString()} songs</span>
			{/if}
		</div>
	</header>

	<!-- Search and filters -->
	<div class="controls">
		<div class="search-box">
			<svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="11" cy="11" r="8" />
				<path d="m21 21-4.3-4.3" />
			</svg>
			<input
				type="text"
				placeholder="Search songs, artists, albums..."
				bind:value={searchQuery}
				oninput={onSearchInput}
			/>
		</div>

		<div class="controls-row">
			<div class="filter-tabs">
				<button class="tab" class:active={syncFilter === 'all'} onclick={() => setFilter('all')}>
					All
				</button>
				<button class="tab" class:active={syncFilter === 'synced'} onclick={() => setFilter('synced')}>
					<span class="tab-dot synced"></span> Synced
				</button>
				<button class="tab" class:active={syncFilter === 'unsynced'} onclick={() => setFilter('unsynced')}>
					<span class="tab-dot unsynced"></span> Not synced
				</button>
			</div>

			{#if selectedIds.size > 0}
				<div class="selection-actions">
					<span class="selection-info">{selectedIds.size} selected</span>
					<button class="btn-action" onclick={syncSelected} disabled={syncing}>
						{syncing ? 'Syncing...' : `Sync ${selectedIds.size} songs`}
					</button>
					<button class="btn-ghost" onclick={() => { selectedIds = new Set(); }}>Clear</button>
				</div>
			{/if}
		</div>
	</div>

	<!-- Track table -->
	{#if loading}
		<div class="loading-state">
			<div class="spinner"></div>
		</div>
	{:else if tracks.length === 0}
		<div class="empty-state">
			<p>No songs found</p>
			{#if searchQuery || syncFilter !== 'all'}
				<button class="btn-text" onclick={() => { searchQuery = ''; syncFilter = 'all'; loadTracks(); }}>
					Clear filters
				</button>
			{:else}
				<p class="hint">Scan your library from Settings to populate this view.</p>
			{/if}
		</div>
	{:else}
		<div class="table-container">
			<table class="track-table">
				<thead>
					<tr>
						<th class="col-check">
							<button
								class="header-check"
								onclick={toggleAll}
								title={allUnsyncedSelected ? 'Deselect all' : 'Select all unsynced'}
							>
								{#if allUnsyncedSelected && unsyncedOnPage.length > 0}
									<span class="check-on">&#10003;</span>
								{:else if selectedIds.size > 0}
									<span class="check-partial">&#8211;</span>
								{:else}
									<span class="check-off"></span>
								{/if}
							</button>
						</th>
						<th class="col-status"></th>
						<th class="col-title">
							<button class="sort-btn" onclick={() => toggleSort('title')}>
								Name
								{#if sortBy === 'title'}
									<span class="sort-arrow">{sortOrder === 'asc' ? '&#9650;' : '&#9660;'}</span>
								{/if}
							</button>
						</th>
						<th class="col-artist">
							<button class="sort-btn" onclick={() => toggleSort('artist')}>
								Artist
								{#if sortBy === 'artist'}
									<span class="sort-arrow">{sortOrder === 'asc' ? '&#9650;' : '&#9660;'}</span>
								{/if}
							</button>
						</th>
						<th class="col-album">
							<button class="sort-btn" onclick={() => toggleSort('album')}>
								Album
								{#if sortBy === 'album'}
									<span class="sort-arrow">{sortOrder === 'asc' ? '&#9650;' : '&#9660;'}</span>
								{/if}
							</button>
						</th>
						<th class="col-duration">
							<button class="sort-btn" onclick={() => toggleSort('duration')}>
								Time
								{#if sortBy === 'duration'}
									<span class="sort-arrow">{sortOrder === 'asc' ? '&#9650;' : '&#9660;'}</span>
								{/if}
							</button>
						</th>
						<th class="col-quality">
							<button class="sort-btn" onclick={() => toggleSort('bitrate')}>
								Quality
								{#if sortBy === 'bitrate'}
									<span class="sort-arrow">{sortOrder === 'asc' ? '&#9650;' : '&#9660;'}</span>
								{/if}
							</button>
						</th>
					</tr>
				</thead>
				<tbody>
					{#each tracks as track (track.id)}
						<tr
							class:synced={!!track.is_synced}
							class:selected={selectedIds.has(track.id)}
						>
							<td class="col-check">
								<button
									class="row-check"
									onclick={() => toggleTrack(track.id)}
									disabled={!!track.is_synced}
								>
									{#if track.is_synced}
										<span class="check-synced">&#10003;</span>
									{:else if selectedIds.has(track.id)}
										<span class="check-on">&#10003;</span>
									{:else}
										<span class="check-off"></span>
									{/if}
								</button>
							</td>
							<td class="col-status">
								{#if track.is_synced}
									<span class="status-dot synced" title="On player"></span>
								{/if}
							</td>
							<td class="col-title" title={track.title || 'Unknown Title'}>
								{track.title || 'Unknown Title'}
							</td>
							<td class="col-artist" title={track.album_artist || track.artist || 'Unknown Artist'}>
								{track.album_artist || track.artist || 'Unknown Artist'}
							</td>
							<td class="col-album" title={track.album || 'Unknown Album'}>
								{track.album || 'Unknown Album'}
							</td>
							<td class="col-duration">
								{formatDuration(track.duration)}
							</td>
							<td class="col-quality" title={track.sample_rate ? `${track.sample_rate} Hz` : ''}>
								{formatQuality(track)}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Pagination -->
		{#if totalPages > 1}
			<div class="pagination">
				<button
					class="page-btn"
					disabled={currentPage <= 1}
					onclick={() => { currentPage--; loadTracks(); }}
				>
					&#8592; Previous
				</button>
				<span class="page-info">Page {currentPage} of {totalPages}</span>
				<button
					class="page-btn"
					disabled={currentPage >= totalPages}
					onclick={() => { currentPage++; loadTracks(); }}
				>
					Next &#8594;
				</button>
			</div>
		{/if}
	{/if}
</div>

<style>
	.library-page {
		max-width: 1200px;
	}

	.page-header h1 {
		font-family: var(--font-display);
		font-size: 1.5rem;
		font-weight: 400;
		margin: 0;
	}

	.header-row {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
	}

	.header-count {
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}

	/* Controls */
	.controls {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin: 1.25rem 0 1rem;
	}

	.controls-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.search-box {
		position: relative;
	}

	.search-icon {
		position: absolute;
		left: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
		width: 16px;
		height: 16px;
		color: var(--color-text-faint);
	}

	.search-box input {
		width: 100%;
		padding: 0.5rem 0.75rem 0.5rem 2.25rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: 6px;
		color: var(--color-text);
		font-size: 0.875rem;
		font-family: inherit;
		outline: none;
		transition: border-color 0.15s;
		box-sizing: border-box;
	}

	.search-box input::placeholder {
		color: var(--color-text-faint);
	}

	.search-box input:focus {
		border-color: var(--color-accent-muted);
	}

	/* Filter tabs */
	.filter-tabs {
		display: flex;
		gap: 2px;
		background: var(--color-surface);
		border-radius: 6px;
		padding: 3px;
		width: fit-content;
	}

	.tab {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		border-radius: 4px;
		border: none;
		background: transparent;
		color: var(--color-text-muted);
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
		font-family: inherit;
	}

	.tab:hover {
		color: var(--color-text);
	}

	.tab.active {
		background: var(--color-surface-raised);
		color: var(--color-text);
	}

	.tab-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
	}

	.tab-dot.synced { background: var(--color-synced); }
	.tab-dot.unsynced { background: var(--color-unsynced); }

	/* Selection actions */
	.selection-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.selection-info {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}

	.btn-action {
		padding: 0.3125rem 0.75rem;
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

	.btn-ghost {
		padding: 0.3125rem 0.625rem;
		border-radius: 5px;
		border: 1px solid var(--color-border);
		background: transparent;
		color: var(--color-text-muted);
		font-size: 0.8125rem;
		cursor: pointer;
		font-family: inherit;
	}

	.btn-ghost:hover {
		border-color: var(--color-text-faint);
		color: var(--color-text);
	}

	.btn-text {
		background: none;
		border: none;
		color: var(--color-accent);
		font-size: 0.8125rem;
		cursor: pointer;
		padding: 0;
		font-family: inherit;
	}

	.btn-text:hover {
		text-decoration: underline;
	}

	/* Table */
	.table-container {
		background: var(--color-surface);
		border-radius: 8px;
		overflow: hidden;
		overflow-x: auto;
	}

	.track-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8125rem;
		table-layout: fixed;
	}

	/* Column widths */
	.col-check { width: 36px; }
	.col-status { width: 24px; }
	.col-title { width: 30%; }
	.col-artist { width: 22%; }
	.col-album { width: 22%; }
	.col-duration { width: 60px; }
	.col-quality { width: 90px; }

	/* Header */
	.track-table thead {
		position: sticky;
		top: 0;
		z-index: 1;
	}

	.track-table thead tr {
		background: var(--color-surface-raised);
		border-bottom: 1px solid var(--color-border);
	}

	.track-table th {
		padding: 0.5rem 0.5rem;
		text-align: left;
		font-weight: 500;
		color: var(--color-text-muted);
		font-size: 0.6875rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		white-space: nowrap;
		user-select: none;
	}

	.track-table th.col-duration,
	.track-table th.col-quality {
		text-align: right;
	}

	.track-table th.col-check,
	.track-table th.col-status {
		padding-left: 0.625rem;
		padding-right: 0;
	}

	.sort-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		background: none;
		border: none;
		color: inherit;
		font: inherit;
		text-transform: inherit;
		letter-spacing: inherit;
		cursor: pointer;
		padding: 0;
	}

	.sort-btn:hover {
		color: var(--color-text);
	}

	.sort-arrow {
		font-size: 0.5rem;
		line-height: 1;
		color: var(--color-accent);
	}

	/* Rows */
	.track-table tbody tr {
		border-bottom: 1px solid var(--color-border-subtle);
		transition: background 0.1s;
	}

	.track-table tbody tr:last-child {
		border-bottom: none;
	}

	.track-table tbody tr:hover {
		background: var(--color-surface-raised);
	}

	.track-table tbody tr.selected {
		background: rgba(212, 168, 67, 0.06);
	}

	.track-table tbody tr.synced {
		opacity: 0.6;
	}

	.track-table tbody tr.synced:hover {
		opacity: 0.8;
	}

	.track-table td {
		padding: 0.4375rem 0.5rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		vertical-align: middle;
	}

	.track-table td.col-check,
	.track-table td.col-status {
		padding-left: 0.625rem;
		padding-right: 0;
		overflow: visible;
	}

	.track-table td.col-title {
		color: var(--color-text);
	}

	.track-table td.col-artist,
	.track-table td.col-album {
		color: var(--color-text-muted);
	}

	.track-table td.col-duration {
		text-align: right;
		color: var(--color-text-muted);
	}

	.track-table td.col-quality {
		text-align: right;
		color: var(--color-text-faint);
		font-size: 0.75rem;
	}

	/* Checkboxes */
	.header-check, .row-check {
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

	.row-check:disabled {
		cursor: default;
	}

	.check-off {
		width: 14px;
		height: 14px;
		border: 1.5px solid var(--color-border);
		border-radius: 3px;
		display: block;
	}

	.check-on {
		width: 14px;
		height: 14px;
		background: var(--color-accent);
		border-radius: 3px;
		color: #1a1815;
		font-size: 0.5625rem;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
	}

	.check-partial {
		width: 14px;
		height: 14px;
		background: var(--color-accent-muted);
		border-radius: 3px;
		color: var(--color-text);
		font-size: 0.625rem;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
	}

	.check-synced {
		color: var(--color-synced);
		font-size: 0.6875rem;
	}

	/* Status dot */
	.status-dot {
		display: block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
	}

	.status-dot.synced {
		background: var(--color-synced);
	}

	/* Loading / empty */
	.loading-state, .empty-state {
		text-align: center;
		padding: 4rem 0;
		color: var(--color-text-muted);
	}

	.empty-state p {
		margin: 0 0 0.5rem;
	}

	.hint {
		color: var(--color-text-faint);
		font-size: 0.875rem;
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

	/* Pagination */
	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		padding: 1.5rem 0;
	}

	.page-btn {
		padding: 0.375rem 0.75rem;
		border-radius: 4px;
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		color: var(--color-text-muted);
		font-size: 0.8125rem;
		cursor: pointer;
		font-family: inherit;
	}

	.page-btn:hover:not(:disabled) {
		border-color: var(--color-accent-muted);
		color: var(--color-text);
	}

	.page-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.page-info {
		font-size: 0.8125rem;
		color: var(--color-text-faint);
	}

	/* Responsive */
	@media (max-width: 768px) {
		.col-quality { display: none; }
		.col-album { display: none; }

		.col-title { width: auto; }
		.col-artist { width: 30%; }
	}

	@media (max-width: 480px) {
		.col-artist { display: none; }
		.col-title { width: auto; }
	}
</style>
