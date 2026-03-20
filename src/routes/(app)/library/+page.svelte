<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { slide } from 'svelte/transition';
	import { addToast } from '$lib/stores/toast.svelte.js';

	// --- Shared types ---

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

	interface Artist {
		name: string;
		album_count: number;
		track_count: number;
		synced_count: number;
		total_size: number;
	}

	interface Album {
		album: string;
		artist: string;
		year: number | null;
		track_count: number;
		synced_count: number;
		total_size: number;
	}

	interface LibraryStats {
		total_tracks: number;
		total_albums: number;
		total_artists: number;
		total_size: number;
		total_duration: number;
		synced_tracks: number;
	}

	interface PlayerTrack {
		id: number;
		relative_path: string;
		library_track_id: number | null;
		file_size: number;
		is_orphan: number;
		title: string | null;
		artist: string | null;
		album: string | null;
		duration: number | null;
	}

	// --- State ---

	type ViewMode = 'artists' | 'albums' | 'tracks' | 'player';
	let viewMode = $state<ViewMode>('artists');

	// Shared
	let loading = $state(true);
	let syncing = $state(false);
	let searchQuery = $state('');
	let syncFilter = $state('all');
	let stats = $state<LibraryStats | null>(null);
	let playerStorage = $state<{ total: number; used: number; free: number; managedSize: number } | null>(null);

	// Artists
	let artists = $state<Artist[]>([]);

	// Albums
	let albums = $state<Album[]>([]);
	let albumPage = $state(1);
	let albumTotalPages = $state(1);
	let artistFilter = $state('');

	// Tracks
	let tracks = $state<Track[]>([]);
	let trackPage = $state(1);
	let trackTotalPages = $state(1);
	let trackTotal = $state(0);
	let sortBy = $state('artist');
	let sortOrder = $state<'asc' | 'desc'>('asc');
	let selectedIds = $state<Set<number>>(new Set());

	// Player
	let playerTracks = $state<PlayerTrack[]>([]);
	let playerPage = $state(1);
	let playerTotalPages = $state(1);
	let playerTotal = $state(0);
	let playerSelectedIds = $state<Set<number>>(new Set());
	let removing = $state(false);
	let orphans = $state<{ id: number; relative_path: string; file_size: number }[]>([]);
	let showDeleteAllConfirm = $state(false);
	let deleteConfirmText = $state('');
	let removingAll = $state(false);

	// --- Helpers ---

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
	}

	function formatDuration(seconds: number | null): string {
		if (!seconds) return '--:--';
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	function formatDurationLong(seconds: number): string {
		const days = Math.floor(seconds / 86400);
		const hours = Math.floor((seconds % 86400) / 3600);
		if (days > 0) return `${days}d ${hours}h`;
		const mins = Math.floor((seconds % 3600) / 60);
		return `${hours}h ${mins}m`;
	}

	function syncStatusClass(synced: number, total: number): string {
		if (synced === total) return 'synced';
		if (synced > 0) return 'partial';
		return 'unsynced';
	}

	function syncStatusLabel(synced: number, total: number): string {
		if (synced === total) return 'Synced';
		if (synced > 0) return `${synced}/${total}`;
		return 'Not synced';
	}

	function albumGradient(name: string): string {
		let hash = 0;
		for (let i = 0; i < name.length; i++) {
			hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
		}
		const hue = Math.abs(hash) % 360;
		return `linear-gradient(145deg, hsl(${hue}, 38%, 22%), hsl(${(hue + 40) % 360}, 42%, 15%))`;
	}

	// --- Data loading ---

	async function loadStats() {
		const [statsRes, storageRes] = await Promise.all([
			fetch('/api/library/stats'),
			fetch('/api/player/storage')
		]);
		stats = await statsRes.json();
		const storageData = await storageRes.json();
		playerStorage = storageData.storage ?? null;
	}

	async function loadArtists() {
		loading = true;
		const params = new URLSearchParams();
		if (searchQuery) params.set('q', searchQuery);
		if (syncFilter !== 'all') params.set('sync', syncFilter);
		const res = await fetch(`/api/library/artists?${params}`);
		const data = await res.json();
		artists = data.artists;
		loading = false;
	}

	async function loadAlbums() {
		loading = true;
		const params = new URLSearchParams();
		params.set('page', String(albumPage));
		params.set('limit', '50');
		if (searchQuery) params.set('q', searchQuery);
		if (syncFilter !== 'all') params.set('sync', syncFilter);
		if (artistFilter) params.set('artist', artistFilter);
		const res = await fetch(`/api/library/albums?${params}`);
		const data = await res.json();
		albums = data.albums;
		albumTotalPages = data.pagination.pages;
		loading = false;
	}

	async function loadTracks() {
		loading = true;
		const params = new URLSearchParams();
		params.set('page', String(trackPage));
		params.set('limit', '100');
		params.set('sort', sortBy);
		params.set('order', sortOrder);
		if (searchQuery) params.set('q', searchQuery);
		if (syncFilter !== 'all') params.set('sync', syncFilter);
		const res = await fetch(`/api/library/tracks?${params}`);
		const data = await res.json();
		tracks = data.tracks;
		trackTotalPages = data.pagination.pages;
		trackTotal = data.pagination.total;
		loading = false;
	}

	async function loadPlayerData() {
		loading = true;
		const params = new URLSearchParams({
			page: String(playerPage),
			limit: '100'
		});
		if (searchQuery) params.set('q', searchQuery);

		const [tracksRes, orphansRes] = await Promise.all([
			fetch(`/api/player/tracks?${params}`),
			fetch('/api/player/orphans')
		]);

		const tracksData = await tracksRes.json();
		playerTracks = tracksData.tracks;
		playerTotalPages = tracksData.pagination.pages;
		playerTotal = tracksData.pagination.total;
		const orphansData = await orphansRes.json();
		orphans = orphansData.orphans;
		loading = false;
	}

	function loadCurrentView() {
		if (viewMode === 'artists') loadArtists();
		else if (viewMode === 'albums') loadAlbums();
		else if (viewMode === 'tracks') loadTracks();
		else if (viewMode === 'player') loadPlayerData();
	}

	function setView(mode: ViewMode) {
		const url = new URL(page.url);
		url.searchParams.set('view', mode);
		if (mode !== 'albums') url.searchParams.delete('artist');
		goto(url.toString(), { replaceState: true, noScroll: true });
	}

	function setFilter(filter: string) {
		syncFilter = filter;
		albumPage = 1;
		trackPage = 1;
		loadCurrentView();
	}

	let searchTimeout: ReturnType<typeof setTimeout>;
	function onSearchInput() {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			albumPage = 1;
			trackPage = 1;
			playerPage = 1;
			loadCurrentView();
		}, 300);
	}

	// --- Artists actions ---

	async function syncArtist(artistName: string) {
		syncing = true;
		try {
			const res = await fetch('/api/sync/copy', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ artist: artistName })
			});
			const result = await res.json();
			if (result.copied > 0) addToast('success', `Synced ${result.copied} tracks from ${artistName}`);
			if (result.failed > 0) addToast('error', `Failed to sync ${result.failed} tracks`, result.errors?.[0], 10000);
		} catch { addToast('error', 'Sync failed'); }
		syncing = false;
		await Promise.all([loadArtists(), loadStats()]);
	}

	async function removeArtist(artistName: string) {
		syncing = true;
		try {
			const res = await fetch('/api/sync/remove', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ artist: artistName })
			});
			const result = await res.json();
			if (result.removed > 0) addToast('success', `Removed ${result.removed} tracks by ${artistName}`);
			if (result.failed > 0) addToast('error', `Failed to remove ${result.failed} tracks`, result.errors?.[0], 10000);
		} catch { addToast('error', 'Remove failed'); }
		syncing = false;
		await Promise.all([loadArtists(), loadStats()]);
	}

	function showArtistAlbums(artistName: string) {
		const url = new URL(page.url);
		url.searchParams.set('view', 'albums');
		url.searchParams.set('artist', artistName);
		goto(url.toString(), { replaceState: true, noScroll: true });
	}

	// --- Albums actions ---

	async function syncAlbum(artistName: string, albumName: string) {
		syncing = true;
		try {
			const res = await fetch('/api/sync/copy', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ artist: artistName, album: albumName })
			});
			const result = await res.json();
			if (result.copied > 0) addToast('success', `Synced ${result.copied} tracks from "${albumName}"`);
			if (result.failed > 0) addToast('error', `Failed to sync ${result.failed} tracks`, result.errors?.[0], 10000);
		} catch { addToast('error', 'Sync failed'); }
		syncing = false;
		await Promise.all([loadAlbums(), loadStats()]);
	}

	async function removeAlbum(artistName: string, albumName: string) {
		syncing = true;
		try {
			const res = await fetch('/api/sync/remove', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ artist: artistName, album: albumName })
			});
			const result = await res.json();
			if (result.removed > 0) addToast('success', `Removed ${result.removed} tracks from "${albumName}"`);
			if (result.failed > 0) addToast('error', `Failed to remove ${result.failed} tracks`, result.errors?.[0], 10000);
		} catch { addToast('error', 'Remove failed'); }
		syncing = false;
		await Promise.all([loadAlbums(), loadStats()]);
	}

	// --- Tracks actions ---

	function toggleSort(column: string) {
		if (sortBy === column) {
			sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			sortBy = column;
			sortOrder = 'asc';
		}
		trackPage = 1;
		loadTracks();
	}

	function toggleTrack(id: number) {
		const next = new Set(selectedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedIds = next;
	}

	let unsyncedOnPage = $derived(tracks.filter(t => !t.is_synced));
	let allUnsyncedSelected = $derived(
		unsyncedOnPage.length > 0 && unsyncedOnPage.every(t => selectedIds.has(t.id))
	);

	function toggleAll() {
		if (selectedIds.size === unsyncedOnPage.length) {
			selectedIds = new Set();
		} else {
			selectedIds = new Set(unsyncedOnPage.map(t => t.id));
		}
	}

	let selectedSize = $derived(
		tracks.filter(t => selectedIds.has(t.id)).reduce((sum, t) => sum + (t.file_size || 0), 0)
	);

	let storageWarning = $derived(
		playerStorage !== null && selectedSize > playerStorage.free
	);

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
			if (result.copied > 0) addToast('success', `Synced ${result.copied} track${result.copied > 1 ? 's' : ''}`);
			if (result.failed > 0) addToast('error', `Failed to sync ${result.failed} tracks`, result.errors?.[0], 10000);
		} catch { addToast('error', 'Sync failed'); }
		selectedIds = new Set();
		syncing = false;
		await Promise.all([loadTracks(), loadStats()]);
	}

	// --- Player actions ---

	function togglePlayerTrack(id: number) {
		const next = new Set(playerSelectedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		playerSelectedIds = next;
	}

	async function removeSelectedPlayer() {
		if (playerSelectedIds.size === 0) return;
		removing = true;
		try {
			const res = await fetch('/api/sync/remove', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ trackIds: [...playerSelectedIds] })
			});
			const result = await res.json();
			if (result.removed > 0) addToast('success', `Removed ${result.removed} tracks`);
			if (result.failed > 0) addToast('error', `Failed to remove ${result.failed} tracks`, result.errors?.[0], 10000);
		} catch { addToast('error', 'Remove failed'); }
		playerSelectedIds = new Set();
		removing = false;
		await Promise.all([loadPlayerData(), loadStats()]);
	}

	async function removeAll() {
		removingAll = true;
		try {
			const res = await fetch('/api/sync/remove-all', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});
			const result = await res.json();
			if (result.removed > 0) addToast('success', `Removed all ${result.removed} tracks`);
			if (result.failed > 0) addToast('error', `Failed to remove ${result.failed} tracks`, result.errors?.[0], 10000);
		} catch { addToast('error', 'Remove all failed'); }
		removingAll = false;
		showDeleteAllConfirm = false;
		deleteConfirmText = '';
		await Promise.all([loadPlayerData(), loadStats()]);
	}

	let deleteConfirmValid = $derived(deleteConfirmText === 'DELETE ALL');

	// --- Init: react to URL changes (initial load + sidebar navigation) ---

	let _prevUrlKey = '';

	$effect(() => {
		const urlView = (page.url.searchParams.get('view') || 'artists') as ViewMode;
		const urlArtist = page.url.searchParams.get('artist') || '';
		const urlKey = `${urlView}:${urlArtist}`;

		if (urlKey === _prevUrlKey) return;
		_prevUrlKey = urlKey;

		viewMode = urlView;
		artistFilter = urlArtist;
		searchQuery = '';
		syncFilter = 'all';
		selectedIds = new Set();
		playerSelectedIds = new Set();
		albumPage = 1;
		trackPage = 1;
		playerPage = 1;
		loading = true;

		loadStats();
		loadCurrentView();
	});
</script>

<div class="music-page">
	<header class="page-header">
		<div class="header-row">
			<h1>{viewMode === 'artists' ? 'Artists' : viewMode === 'albums' ? 'Albums' : viewMode === 'tracks' ? 'Tracks' : 'Player'}</h1>
			{#if stats}
				<span class="header-stats">
					{#if viewMode === 'artists'}{stats.total_artists.toLocaleString()} artists
					{:else if viewMode === 'albums'}{stats.total_albums.toLocaleString()} albums
					{:else if viewMode === 'tracks'}{stats.total_tracks.toLocaleString()} tracks
					{:else}{stats.synced_tracks.toLocaleString()} on player{/if}
					{#if playerStorage && viewMode !== 'player'}
						<span class="sep">·</span>
						{formatBytes(playerStorage.free)} free
					{/if}
				</span>
			{/if}
		</div>
	</header>

	<!-- Controls bar: search + sync filter -->
	<div class="controls">
		<div class="search-box">
			<svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
			</svg>
			<input
				type="text"
				placeholder={viewMode === 'artists' ? 'Search artists...' : viewMode === 'albums' ? 'Search albums...' : viewMode === 'player' ? 'Search player tracks...' : 'Search songs, artists, albums...'}
				bind:value={searchQuery}
				oninput={onSearchInput}
			/>
		</div>

		{#if viewMode !== 'player'}
			<div class="controls-row">
				<div class="filter-tabs">
					<button class="tab" class:active={syncFilter === 'all'} onclick={() => setFilter('all')}>All</button>
					<button class="tab" class:active={syncFilter === 'synced'} onclick={() => setFilter('synced')}>
						<span class="tab-dot synced"></span> Synced
					</button>
					{#if viewMode === 'albums' || viewMode === 'artists'}
						<button class="tab" class:active={syncFilter === 'partial'} onclick={() => setFilter('partial')}>
							<span class="tab-dot partial"></span> Partial
						</button>
					{/if}
					<button class="tab" class:active={syncFilter === 'unsynced'} onclick={() => setFilter('unsynced')}>
						<span class="tab-dot unsynced"></span> Not synced
					</button>
				</div>

				{#if artistFilter && viewMode === 'albums'}
					<div class="filter-chip">
						<span>Artist: {artistFilter}</span>
						<button class="chip-clear" onclick={() => { artistFilter = ''; albumPage = 1; loadAlbums(); }}>&times;</button>
					</div>
				{/if}

			</div>
		{/if}
	</div>

	<!-- Content -->
	{#if loading}
		<div class="loading-state"><div class="spinner"></div></div>

	<!-- ===== ARTISTS VIEW ===== -->
	{:else if viewMode === 'artists'}
		{#if artists.length === 0}
			<div class="empty-state">
				<svg class="empty-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="16" cy="18" r="6"/><circle cx="32" cy="18" r="6"/>
					<path d="M4 42c0-6.627 5.373-12 12-12h16c6.627 0 12 5.373 12 12"/>
				</svg>
				<p class="empty-title">{searchQuery || syncFilter !== 'all' ? 'No artists match your filters' : 'No artists yet'}</p>
				<p class="empty-sub">{searchQuery || syncFilter !== 'all' ? 'Try adjusting your search or filter' : 'Scan your library to find music'}</p>
				{#if searchQuery || syncFilter !== 'all'}
					<button class="btn-text" onclick={() => { searchQuery = ''; syncFilter = 'all'; loadArtists(); }}>Clear filters</button>
				{/if}
			</div>
		{:else}
			<div class="list-container">
				{#each artists as artist}
					{@const status = syncStatusClass(artist.synced_count, artist.track_count)}
					<div class="list-row artist-row">
						<button class="row-main" onclick={() => showArtistAlbums(artist.name)}>
							<span class="sync-dot {status}"></span>
							<span class="row-name">{artist.name}</span>
							<span class="row-meta">
								{artist.album_count} album{artist.album_count !== 1 ? 's' : ''}
								<span class="sep">·</span>
								{artist.track_count} tracks
								<span class="sep">·</span>
								{formatBytes(artist.total_size)}
							</span>
							<span class="sync-label {status}">{syncStatusLabel(artist.synced_count, artist.track_count)}</span>
						</button>
						<div class="row-actions">
							{#if artist.synced_count < artist.track_count}
								<button class="btn-sync-sm" onclick={() => syncArtist(artist.name)} disabled={syncing} title="Sync to player">
									{artist.synced_count > 0 ? 'Sync rest' : 'Sync'}
								</button>
							{/if}
							{#if artist.synced_count > 0}
								<button class="btn-remove-sm" onclick={() => removeArtist(artist.name)} disabled={syncing} title="Remove from player">Remove</button>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}

	<!-- ===== ALBUMS VIEW ===== -->
	{:else if viewMode === 'albums'}
		{#if albums.length === 0}
			<div class="empty-state">
				<svg class="empty-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="24" cy="24" r="18"/><circle cx="24" cy="24" r="6"/>
					<path d="M24 6v6M24 36v6M6 24h6M36 24h6"/>
				</svg>
				<p class="empty-title">{searchQuery || syncFilter !== 'all' || artistFilter ? 'No albums match your filters' : 'No albums yet'}</p>
				<p class="empty-sub">{searchQuery || syncFilter !== 'all' || artistFilter ? 'Try adjusting your search or filter' : 'Scan your library to find albums'}</p>
				{#if searchQuery || syncFilter !== 'all' || artistFilter}
					<button class="btn-text" onclick={() => { searchQuery = ''; syncFilter = 'all'; artistFilter = ''; albumPage = 1; loadAlbums(); }}>Clear filters</button>
				{/if}
			</div>
		{:else}
			<div class="list-container">
				{#each albums as album}
					{@const status = syncStatusClass(album.synced_count, album.track_count)}
					{@const albumId = encodeURIComponent(`${album.artist}:${album.album}`)}
					{@const artUrl = `/api/library/art/${encodeURIComponent((album.artist || '') + ':' + album.album)}`}
					<div class="list-row album-row">
						<a class="row-main" href="/library/album/{albumId}">
							<span class="sync-dot {status}"></span>
							<div class="album-art-sm" style="background: {albumGradient(album.album)}">
								<img
									src={artUrl}
									alt=""
									class="album-art-img"
									onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
								/>
							</div>
							<div class="album-info">
								<span class="row-name">{album.album}</span>
								<span class="row-sub">{album.artist}{album.year ? ` · ${album.year}` : ''}</span>
							</div>
							<span class="row-meta">
								{album.track_count} tracks
								<span class="sep">·</span>
								{formatBytes(album.total_size)}
							</span>
							<span class="sync-label {status}">{syncStatusLabel(album.synced_count, album.track_count)}</span>
						</a>
						<div class="row-actions">
							{#if album.synced_count < album.track_count}
								<button class="btn-sync-sm" onclick={() => syncAlbum(album.artist, album.album)} disabled={syncing}>
									{album.synced_count > 0 ? 'Sync rest' : 'Sync'}
								</button>
							{/if}
							{#if album.synced_count > 0}
								<button class="btn-remove-sm" onclick={() => removeAlbum(album.artist, album.album)} disabled={syncing}>Remove</button>
							{/if}
						</div>
					</div>
				{/each}
			</div>

			{#if albumTotalPages > 1}
				<div class="pagination">
					<button class="page-btn" disabled={albumPage <= 1} onclick={() => { albumPage--; loadAlbums(); }}>← Prev</button>
					<span class="page-info">Page {albumPage} of {albumTotalPages}</span>
					<button class="page-btn" disabled={albumPage >= albumTotalPages} onclick={() => { albumPage++; loadAlbums(); }}>Next →</button>
				</div>
			{/if}
		{/if}

	<!-- ===== TRACKS VIEW ===== -->
	{:else if viewMode === 'tracks'}
		{#if tracks.length === 0}
			<div class="empty-state">
				<svg class="empty-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<path d="M20 8h22v28a6 6 0 01-6 6H12a6 6 0 01-6-6V14l8-6z"/>
					<path d="M20 8v6H6M28 22H18M28 30H18"/>
				</svg>
				<p class="empty-title">{searchQuery || syncFilter !== 'all' ? 'No tracks match your filters' : 'No tracks yet'}</p>
				<p class="empty-sub">{searchQuery || syncFilter !== 'all' ? 'Try adjusting your search or filter' : 'Scan your library to find tracks'}</p>
				{#if searchQuery || syncFilter !== 'all'}
					<button class="btn-text" onclick={() => { searchQuery = ''; syncFilter = 'all'; loadTracks(); }}>Clear filters</button>
				{/if}
			</div>
		{:else}
			<div class="table-container">
				<table class="track-table">
					<thead>
						<tr>
							<th class="col-check">
								<button class="header-check" onclick={toggleAll} title={allUnsyncedSelected ? 'Deselect all' : 'Select all unsynced'}>
									{#if allUnsyncedSelected && unsyncedOnPage.length > 0}
										<span class="check-on">✓</span>
									{:else if selectedIds.size > 0}
										<span class="check-partial">–</span>
									{:else}
										<span class="check-off"></span>
									{/if}
								</button>
							</th>
							<th class="col-status"></th>
							<th class="col-title"><button class="sort-btn" onclick={() => toggleSort('title')}>Name {#if sortBy === 'title'}<span class="sort-arrow">{sortOrder === 'asc' ? '▲' : '▼'}</span>{/if}</button></th>
							<th class="col-artist"><button class="sort-btn" onclick={() => toggleSort('artist')}>Artist {#if sortBy === 'artist'}<span class="sort-arrow">{sortOrder === 'asc' ? '▲' : '▼'}</span>{/if}</button></th>
							<th class="col-album"><button class="sort-btn" onclick={() => toggleSort('album')}>Album {#if sortBy === 'album'}<span class="sort-arrow">{sortOrder === 'asc' ? '▲' : '▼'}</span>{/if}</button></th>
							<th class="col-duration"><button class="sort-btn" onclick={() => toggleSort('duration')}>Time {#if sortBy === 'duration'}<span class="sort-arrow">{sortOrder === 'asc' ? '▲' : '▼'}</span>{/if}</button></th>
							<th class="col-quality"><button class="sort-btn" onclick={() => toggleSort('bitrate')}>Quality {#if sortBy === 'bitrate'}<span class="sort-arrow">{sortOrder === 'asc' ? '▲' : '▼'}</span>{/if}</button></th>
						</tr>
					</thead>
					<tbody>
						{#each tracks as track (track.id)}
							<tr class:synced={!!track.is_synced} class:selected={selectedIds.has(track.id)}>
								<td class="col-check">
									<button class="row-check" onclick={() => toggleTrack(track.id)} disabled={!!track.is_synced}>
										{#if track.is_synced}<span class="check-synced">✓</span>
										{:else if selectedIds.has(track.id)}<span class="check-on">✓</span>
										{:else}<span class="check-off"></span>{/if}
									</button>
								</td>
								<td class="col-status">{#if track.is_synced}<span class="status-dot synced"></span>{/if}</td>
								<td class="col-title">{track.title || 'Unknown Title'}</td>
								<td class="col-artist">{track.album_artist || track.artist || 'Unknown Artist'}</td>
								<td class="col-album">{track.album || 'Unknown Album'}</td>
								<td class="col-duration">{formatDuration(track.duration)}</td>
								<td class="col-quality">{track.format || ''}{track.bitrate ? ` ${track.bitrate}k` : ''}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			{#if trackTotalPages > 1}
				<div class="pagination">
					<button class="page-btn" disabled={trackPage <= 1} onclick={() => { trackPage--; loadTracks(); }}>← Prev</button>
					<span class="page-info">Page {trackPage} of {trackTotalPages} ({trackTotal.toLocaleString()} tracks)</span>
					<button class="page-btn" disabled={trackPage >= trackTotalPages} onclick={() => { trackPage++; loadTracks(); }}>Next →</button>
				</div>
			{/if}
		{/if}

	<!-- ===== PLAYER VIEW ===== -->
	{:else if viewMode === 'player'}
		{#if playerStorage}
			<section class="section">
				<div class="section-header">
					<h2 class="section-title">Storage</h2>
					{#if playerTotal > 0}
						<button class="btn-delete-all" onclick={() => { showDeleteAllConfirm = true; deleteConfirmText = ''; }}>Delete all files</button>
					{/if}
				</div>
				<div class="storage-card">
					<div class="storage-bar">
						<div class="storage-fill" style="width: {playerStorage.total > 0 ? (playerStorage.used / playerStorage.total) * 100 : 0}%"></div>
					</div>
					<div class="storage-stats">
						<span>{formatBytes(playerStorage.used)} used</span>
						<span>{formatBytes(playerStorage.free)} free</span>
						<span>{formatBytes(playerStorage.total)} total</span>
					</div>
				</div>
			</section>
		{/if}

		{#if orphans.length > 0}
			<div class="orphan-warning">
				<strong>{orphans.length} orphaned files</strong> on player not found in library.
			</div>
		{/if}

		<section class="section">
			<div class="list-header">
				<h2 class="section-title">{playerTotal} tracks on player</h2>
				{#if playerSelectedIds.size > 0}
					<div class="selection-actions">
						<button class="btn-remove-sm" onclick={removeSelectedPlayer} disabled={removing}>
							{removing ? 'Removing...' : `Remove ${playerSelectedIds.size}`}
						</button>
						<button class="btn-ghost-sm" onclick={() => { playerSelectedIds = new Set(); }}>Clear</button>
					</div>
				{/if}
			</div>

			{#if playerTracks.length === 0}
				<div class="empty-state">
					<svg class="empty-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<rect x="8" y="6" width="32" height="36" rx="4"/>
						<circle cx="24" cy="30" r="6"/><path d="M20 14h8M24 6v4"/>
					</svg>
					<p class="empty-title">No tracks on player</p>
					<p class="empty-sub">Sync music from the Artists or Albums view</p>
				</div>
			{:else}
				<div class="list-container">
					{#each playerTracks as track}
						<div class="list-row player-track-row" class:orphan={track.is_orphan} class:selected={playerSelectedIds.has(track.id)}>
							<button class="track-select" onclick={() => togglePlayerTrack(track.id)}>
								{#if playerSelectedIds.has(track.id)}
									<span class="check-on">✓</span>
								{:else}
									<span class="check-off"></span>
								{/if}
							</button>
							<div class="row-main-info">
								<span class="row-name">
									{track.title || track.relative_path.split('/').pop() || 'Unknown'}
									{#if track.is_orphan}<span class="orphan-tag">orphan</span>{/if}
								</span>
								<span class="row-sub">
									{#if track.artist}{track.artist}{/if}
									{#if track.album} · {track.album}{/if}
								</span>
							</div>
							<span class="row-meta-end">{formatBytes(track.file_size)}</span>
						</div>
					{/each}
				</div>

				{#if playerTotalPages > 1}
					<div class="pagination">
						<button class="page-btn" disabled={playerPage <= 1} onclick={() => { playerPage--; loadPlayerData(); }}>← Prev</button>
						<span class="page-info">Page {playerPage} of {playerTotalPages}</span>
						<button class="page-btn" disabled={playerPage >= playerTotalPages} onclick={() => { playerPage++; loadPlayerData(); }}>Next →</button>
					</div>
				{/if}
			{/if}
		</section>
	{/if}
</div>

<!-- Floating selection toolbar -->
{#if viewMode === 'tracks' && selectedIds.size > 0}
	<div class="floating-toolbar" transition:slide={{ duration: 180, axis: 'y' }}>
		<div class="toolbar-info">
			<strong class="toolbar-count">{selectedIds.size}</strong>
			<span class="toolbar-label">{selectedIds.size === 1 ? 'track' : 'tracks'} selected</span>
			<span class="toolbar-size">{formatBytes(selectedSize)}</span>
			{#if storageWarning}
				<span class="toolbar-warning">
					<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;display:inline;vertical-align:-1px">
						<path d="M8 2L14 13H2L8 2z"/><path d="M8 6v4"/><circle cx="8" cy="11.5" r="0.5" fill="currentColor"/>
					</svg>
					Not enough space
				</span>
			{/if}
		</div>
		<div class="toolbar-actions">
			<button class="btn-ghost toolbar-clear" onclick={() => { selectedIds = new Set(); }}>Clear</button>
			<button class="btn-action" onclick={syncSelected} disabled={syncing || storageWarning}>
				{syncing ? 'Syncing...' : `Sync ${selectedIds.size} track${selectedIds.size !== 1 ? 's' : ''}`}
			</button>
		</div>
	</div>
{/if}

<!-- Delete all confirmation modal -->
{#if showDeleteAllConfirm}
	<div class="modal-backdrop" role="dialog" onclick={() => { showDeleteAllConfirm = false; deleteConfirmText = ''; }}>
		<div class="modal" role="document" onclick={(e) => e.stopPropagation()}>
			<h3 class="modal-title">Delete all files from player</h3>
			<p class="modal-warning">
				This will permanently delete <strong>{playerTotal} tracks</strong> from the player. This cannot be undone.
			</p>
			<p class="modal-instruction">Type <code>DELETE ALL</code> to confirm:</p>
			<input type="text" class="modal-input" placeholder="DELETE ALL" bind:value={deleteConfirmText} autocomplete="off" spellcheck="false" />
			<div class="modal-actions">
				<button class="btn-cancel" onclick={() => { showDeleteAllConfirm = false; deleteConfirmText = ''; }} disabled={removingAll}>Cancel</button>
				<button class="btn-confirm-delete" onclick={removeAll} disabled={!deleteConfirmValid || removingAll}>{removingAll ? 'Deleting...' : 'Delete all files'}</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.music-page { max-width: 1100px; }

	/* Header */
	.page-header { margin-bottom: 1rem; }
	.header-row { display: flex; align-items: baseline; gap: 0.75rem; flex-wrap: wrap; }
	.header-row h1 { font-family: var(--font-display); font-size: 1.5rem; font-weight: 400; margin: 0; }
	.header-stats { font-size: 0.8125rem; color: var(--color-text-faint); }
	.header-stats .sep { color: var(--color-border); margin: 0 0.125rem; }
	.synced-stat { color: var(--color-synced); }

	/* Controls */
	.controls { display: flex; flex-direction: column; gap: 0.625rem; margin-bottom: 1rem; }
	.controls-row { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }
	.search-box { position: relative; }
	.search-icon { position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; color: var(--color-text-faint); }
	.search-box input {
		width: 100%; padding: 0.4375rem 0.75rem 0.4375rem 2.25rem;
		background: var(--color-surface); border: 1px solid var(--color-border-subtle);
		border-radius: 6px; color: var(--color-text); font-size: 0.875rem;
		font-family: inherit; outline: none; box-sizing: border-box;
	}
	.search-box input::placeholder { color: var(--color-text-faint); }
	.search-box input:focus { border-color: var(--color-accent-muted); }

	/* Filter tabs */
	.filter-tabs { display: flex; gap: 2px; background: var(--color-surface); border-radius: 6px; padding: 3px; width: fit-content; }
	.tab {
		display: flex; align-items: center; gap: 0.375rem;
		padding: 0.3125rem 0.625rem; border-radius: 4px; border: none;
		background: transparent; color: var(--color-text-muted);
		font-size: 0.75rem; font-weight: 500; cursor: pointer; font-family: inherit;
	}
	.tab:hover { color: var(--color-text); }
	.tab.active { background: var(--color-surface-raised); color: var(--color-text); }
	.tab-dot { width: 6px; height: 6px; border-radius: 50%; }
	.tab-dot.synced { background: var(--color-synced); }
	.tab-dot.partial { background: var(--color-partial); }
	.tab-dot.unsynced { background: var(--color-unsynced); }

	/* Filter chip */
	.filter-chip {
		display: flex; align-items: center; gap: 0.375rem;
		padding: 0.25rem 0.625rem; background: var(--color-surface-raised);
		border-radius: 4px; font-size: 0.75rem; color: var(--color-text-muted);
	}
	.chip-clear { background: none; border: none; color: var(--color-text-faint); cursor: pointer; font-size: 1rem; padding: 0; line-height: 1; }
	.chip-clear:hover { color: var(--color-text); }

	/* Selection actions */
	.selection-actions { display: flex; align-items: center; gap: 0.5rem; }
	.selection-info { font-size: 0.75rem; color: var(--color-text-muted); }
	.storage-warning { font-size: 0.75rem; color: var(--color-danger); }

	/* Shared list */
	.list-container { background: var(--color-surface); border-radius: 8px; overflow: hidden; }
	.list-row {
		display: flex; align-items: center; gap: 0.5rem;
		border-bottom: 1px solid var(--color-border-subtle);
	}
	.list-row:last-child { border-bottom: none; }

	.row-main {
		display: flex; align-items: center; gap: 0.75rem;
		flex: 1; min-width: 0; padding: 0.625rem 0 0.625rem 1rem;
		background: none; border: none; color: inherit; font: inherit;
		cursor: pointer; text-align: left; text-decoration: none;
	}
	.row-main:hover { background: var(--color-surface-raised); }

	a.row-main { display: flex; }

	.sync-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
	.sync-dot.synced { background: var(--color-synced); }
	.sync-dot.partial { background: var(--color-partial); }
	.sync-dot.unsynced { background: var(--color-unsynced); }

	.row-name { font-size: 0.875rem; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.row-sub { font-size: 0.75rem; color: var(--color-text-faint); }
	.row-meta { font-size: 0.75rem; color: var(--color-text-faint); white-space: nowrap; margin-left: auto; }
	.row-meta .sep { margin: 0 0.25rem; }
	.sync-label { font-size: 0.6875rem; font-weight: 500; white-space: nowrap; min-width: 60px; text-align: right; }
	.sync-label.synced { color: var(--color-synced); }
	.sync-label.partial { color: var(--color-partial); }
	.sync-label.unsynced { color: var(--color-text-faint); }

	.album-info { display: flex; flex-direction: column; gap: 0.0625rem; min-width: 0; flex: 1; }

	.row-actions { display: flex; align-items: center; gap: 0.375rem; padding-right: 0.75rem; flex-shrink: 0; }

	.btn-sync-sm {
		padding: 0.25rem 0.5rem; border-radius: 4px; border: none;
		background: var(--color-accent); color: #1a1815;
		font-size: 0.6875rem; font-weight: 500; cursor: pointer; font-family: inherit;
	}
	.btn-sync-sm:hover:not(:disabled) { background: var(--color-accent-hover); }
	.btn-sync-sm:disabled { opacity: 0.4; cursor: not-allowed; }

	.btn-remove-sm {
		padding: 0.25rem 0.5rem; border-radius: 4px;
		border: 1px solid var(--color-border); background: transparent;
		color: var(--color-text-faint); font-size: 0.6875rem; cursor: pointer; font-family: inherit;
	}
	.btn-remove-sm:hover:not(:disabled) { color: var(--color-danger); border-color: var(--color-danger); }
	.btn-remove-sm:disabled { opacity: 0.4; cursor: not-allowed; }

	.btn-ghost-sm {
		padding: 0.25rem 0.5rem; border-radius: 4px;
		border: 1px solid var(--color-border); background: transparent;
		color: var(--color-text-muted); font-size: 0.6875rem; cursor: pointer; font-family: inherit;
	}

	/* Buttons */
	.btn-action {
		padding: 0.3125rem 0.75rem; border-radius: 5px; border: none;
		background: var(--color-accent); color: #1a1815;
		font-size: 0.8125rem; font-weight: 500; cursor: pointer; font-family: inherit;
	}
	.btn-action:hover:not(:disabled) { background: var(--color-accent-hover); }
	.btn-action:disabled { opacity: 0.5; cursor: not-allowed; }

	.btn-ghost {
		padding: 0.3125rem 0.625rem; border-radius: 5px;
		border: 1px solid var(--color-border); background: transparent;
		color: var(--color-text-muted); font-size: 0.8125rem; cursor: pointer; font-family: inherit;
	}

	.btn-text { background: none; border: none; color: var(--color-accent); font-size: 0.8125rem; cursor: pointer; padding: 0; font-family: inherit; }
	.btn-text:hover { text-decoration: underline; }

	/* Track table */
	.table-container { background: var(--color-surface); border-radius: 8px; overflow: hidden; overflow-x: auto; }
	.track-table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; table-layout: fixed; }
	.col-check { width: 36px; } .col-status { width: 24px; }
	.col-title { width: 30%; } .col-artist { width: 22%; } .col-album { width: 22%; }
	.col-duration { width: 60px; } .col-quality { width: 90px; }
	.track-table thead { position: sticky; top: 0; z-index: 1; }
	.track-table thead tr { background: var(--color-surface-raised); border-bottom: 1px solid var(--color-border); }
	.track-table th { padding: 0.5rem; text-align: left; font-weight: 500; color: var(--color-text-muted); font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; user-select: none; }
	.track-table th.col-duration, .track-table th.col-quality { text-align: right; }
	.track-table th.col-check, .track-table th.col-status { padding-left: 0.625rem; padding-right: 0; }
	.sort-btn { display: inline-flex; align-items: center; gap: 0.25rem; background: none; border: none; color: inherit; font: inherit; text-transform: inherit; letter-spacing: inherit; cursor: pointer; padding: 0; }
	.sort-btn:hover { color: var(--color-text); }
	.sort-arrow { font-size: 0.5rem; color: var(--color-accent); }
	.track-table tbody tr { border-bottom: 1px solid var(--color-border-subtle); transition: background 0.1s; }
	.track-table tbody tr:last-child { border-bottom: none; }
	.track-table tbody tr:hover { background: var(--color-surface-raised); }
	.track-table tbody tr.selected { background: rgba(212, 168, 67, 0.06); }
	.track-table tbody tr.synced { opacity: 0.6; }
	.track-table tbody tr.synced:hover { opacity: 0.8; }
	.track-table td { padding: 0.4375rem 0.5rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align: middle; }
	.track-table td.col-check, .track-table td.col-status { padding-left: 0.625rem; padding-right: 0; overflow: visible; }
	.track-table td.col-title { color: var(--color-text); font-weight: 500; }
	.track-table td.col-artist { color: var(--color-text-muted); font-size: 0.8125rem; }
	.track-table td.col-album { color: var(--color-text-faint); font-size: 0.8125rem; }
	.track-table td.col-duration { text-align: right; color: var(--color-text-faint); font-size: 0.75rem; }
	.track-table td.col-quality { text-align: right; color: var(--color-text-faint); font-size: 0.6875rem; letter-spacing: 0.02em; }

	/* Checkboxes */
	.header-check, .row-check, .track-select {
		width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;
		border: none; background: none; cursor: pointer; padding: 0; flex-shrink: 0;
	}
	.row-check:disabled, .track-select:disabled { cursor: default; }
	.check-off { width: 14px; height: 14px; border: 1.5px solid var(--color-border); border-radius: 3px; display: block; }
	.check-on { width: 14px; height: 14px; background: var(--color-accent); border-radius: 3px; color: #1a1815; font-size: 0.5625rem; display: flex; align-items: center; justify-content: center; font-weight: 700; }
	.check-partial { width: 14px; height: 14px; background: var(--color-accent-muted); border-radius: 3px; color: var(--color-text); font-size: 0.625rem; display: flex; align-items: center; justify-content: center; font-weight: 700; }
	.check-synced { color: var(--color-synced); font-size: 0.6875rem; }
	.status-dot { display: block; width: 6px; height: 6px; border-radius: 50%; }
	.status-dot.synced { background: var(--color-synced); }

	/* Player tab */
	.section { margin-bottom: 1.5rem; }
	.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
	.section-title { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-text-muted); margin: 0; }
	.list-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem; }
	.storage-card { background: var(--color-surface); padding: 1rem 1.25rem; border-radius: 8px; }
	.storage-bar { height: 8px; background: var(--color-surface-raised); border-radius: 4px; overflow: hidden; margin-bottom: 0.625rem; }
	.storage-fill { height: 100%; background: var(--color-accent); border-radius: 4px; }
	.storage-stats { display: flex; gap: 1.5rem; font-size: 0.8125rem; color: var(--color-text-muted); }
	.orphan-warning { background: rgba(212, 168, 67, 0.08); border: 1px solid rgba(212, 168, 67, 0.2); border-radius: 6px; padding: 0.75rem 1rem; font-size: 0.8125rem; color: var(--color-text-muted); margin-bottom: 1.5rem; }
	.orphan-warning strong { color: var(--color-accent); }
	.orphan-tag { font-size: 0.625rem; font-weight: 600; text-transform: uppercase; color: var(--color-partial); background: rgba(212, 168, 67, 0.12); padding: 0.0625rem 0.375rem; border-radius: 2px; margin-left: 0.375rem; }
	.btn-delete-all { padding: 0.25rem 0.625rem; border-radius: 4px; border: 1px solid var(--color-danger); background: transparent; color: var(--color-danger); font-size: 0.75rem; cursor: pointer; font-family: inherit; }
	.btn-delete-all:hover { background: rgba(212, 80, 80, 0.1); }

	.player-track-row { padding: 0.375rem 0.75rem; }
	.player-track-row.orphan { opacity: 0.65; }
	.player-track-row.selected { background: rgba(212, 80, 80, 0.06); }
	.row-main-info { display: flex; flex-direction: column; gap: 0.0625rem; flex: 1; min-width: 0; }
	.row-meta-end { font-size: 0.75rem; color: var(--color-text-faint); flex-shrink: 0; padding-right: 0.25rem; }

	/* Modal */
	.modal-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 1rem; }
	.modal { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 12px; padding: 1.75rem; max-width: 440px; width: 100%; box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5); }
	.modal-title { font-family: var(--font-display); font-size: 1.125rem; font-weight: 400; color: var(--color-danger); margin: 0 0 1rem; }
	.modal-warning { font-size: 0.875rem; color: var(--color-text-muted); line-height: 1.5; margin: 0 0 1rem; }
	.modal-warning strong { color: var(--color-text); }
	.modal-instruction { font-size: 0.8125rem; color: var(--color-text-faint); margin: 0 0 0.5rem; }
	.modal-instruction code { color: var(--color-danger); font-weight: 600; background: rgba(212, 80, 80, 0.1); padding: 0.125rem 0.375rem; border-radius: 3px; }
	.modal-input { width: 100%; padding: 0.5rem 0.75rem; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 6px; color: var(--color-text); font-size: 0.875rem; font-family: inherit; outline: none; box-sizing: border-box; margin-bottom: 1.25rem; }
	.modal-input:focus { border-color: var(--color-danger); }
	.modal-actions { display: flex; gap: 0.625rem; justify-content: flex-end; }
	.btn-cancel { padding: 0.4375rem 1rem; border-radius: 6px; border: 1px solid var(--color-border); background: transparent; color: var(--color-text-muted); font-size: 0.8125rem; cursor: pointer; font-family: inherit; }
	.btn-confirm-delete { padding: 0.4375rem 1rem; border-radius: 6px; border: none; background: var(--color-danger); color: white; font-size: 0.8125rem; font-weight: 500; cursor: pointer; font-family: inherit; }
	.btn-confirm-delete:disabled { opacity: 0.4; cursor: not-allowed; }

	/* Loading */
	.loading-state { text-align: center; padding: 4rem 0; color: var(--color-text-muted); }
	.spinner { width: 24px; height: 24px; border: 2px solid var(--color-border); border-top-color: var(--color-accent); border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto; }
	@keyframes spin { to { transform: rotate(360deg); } }

	.pagination { display: flex; align-items: center; justify-content: center; gap: 1rem; padding: 1.25rem 0; }
	.page-btn { padding: 0.375rem 0.75rem; border-radius: 4px; border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text-muted); font-size: 0.8125rem; cursor: pointer; font-family: inherit; }
	.page-btn:hover:not(:disabled) { border-color: var(--color-accent-muted); color: var(--color-text); }
	.page-btn:disabled { opacity: 0.3; cursor: not-allowed; }
	.page-info { font-size: 0.8125rem; color: var(--color-text-faint); }

	@media (max-width: 768px) {
		.col-quality, .col-album { display: none; }
		.col-title { width: auto; } .col-artist { width: 30%; }
		.row-meta { display: none; }
	}
	@media (max-width: 480px) {
		.col-artist { display: none; }
		.col-title { width: auto; }
	}

	/* Empty states */
	.empty-state { text-align: center; padding: 4rem 2rem; color: var(--color-text-muted); }
	.empty-icon {
		width: 48px; height: 48px; margin: 0 auto 1.25rem;
		color: var(--color-text-faint); opacity: 0.6;
	}
	.empty-title { font-size: 0.9375rem; font-weight: 500; color: var(--color-text-muted); margin: 0 0 0.375rem; }
	.empty-sub { font-size: 0.8125rem; color: var(--color-text-faint); margin: 0 0 1rem; }

	/* Album art thumbnail in list */
	.album-art-sm {
		width: 36px; height: 36px; border-radius: 4px;
		display: flex; align-items: center; justify-content: center;
		flex-shrink: 0; overflow: hidden; position: relative;
	}
	.album-art-sm span {
		font-family: var(--font-display); font-size: 1rem;
		color: rgba(255, 255, 255, 0.6); font-weight: 400;
		text-transform: uppercase;
	}
	.album-art-img {
		position: absolute; inset: 0; width: 100%; height: 100%;
		object-fit: cover; border-radius: 4px;
	}

	/* Floating selection toolbar */
	.floating-toolbar {
		position: fixed;
		bottom: 1.75rem;
		left: 50%;
		transform: translateX(-50%);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: 10px;
		padding: 0.625rem 0.875rem;
		display: flex;
		align-items: center;
		gap: 1rem;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 1px 0 rgba(255,255,255,0.04) inset;
		z-index: 200;
		min-width: 320px;
		backdrop-filter: blur(8px);
	}

	.toolbar-info {
		display: flex; align-items: center; gap: 0.5rem; flex: 1; min-width: 0;
	}
	.toolbar-count { font-size: 0.9375rem; color: var(--color-text); }
	.toolbar-label { font-size: 0.8125rem; color: var(--color-text-muted); }
	.toolbar-size { font-size: 0.75rem; color: var(--color-text-faint); }
	.toolbar-warning {
		font-size: 0.75rem; color: var(--color-danger);
		display: flex; align-items: center; gap: 0.25rem;
	}
	.toolbar-actions { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
	.toolbar-clear {
		padding: 0.375rem 0.625rem; border-radius: 5px;
		border: 1px solid var(--color-border); background: transparent;
		color: var(--color-text-muted); font-size: 0.8125rem; cursor: pointer; font-family: inherit;
	}
	.toolbar-clear:hover { border-color: var(--color-text-faint); color: var(--color-text); }
</style>
