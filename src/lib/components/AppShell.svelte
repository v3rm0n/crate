<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import PlayerSelector from './PlayerSelector.svelte';
	import SyncProgress from './SyncProgress.svelte';
	import { recoverRunningJobs } from '$lib/stores/sync.svelte.js';

	// Recover any running jobs on page load
	$effect(() => {
		recoverRunningJobs();
	});

	interface Player {
		id: number;
		name: string;
		alias: string;
		mount_path: string;
		managed_dir: string;
		is_active: number;
		track_count: number;
		total_size: number;
		is_mounted: boolean;
	}

	let { children, players = [], activePlayer = null, onPlayerSelect }: {
		children: Snippet;
		players?: Player[];
		activePlayer?: Player | null;
		onPlayerSelect?: (playerId: number) => void;
	} = $props();

	const libraryViews = [
		{ view: 'artists', label: 'Artists' },
		{ view: 'albums', label: 'Albums' },
		{ view: 'tracks', label: 'Tracks' },
	];

	let playerStorage = $state<{ total: number; used: number; free: number } | null>(null);

	$effect(() => {
		const pid = activePlayer?.id;
		if (pid != null) {
			fetch('/api/player/storage')
				.then(r => r.json())
				.then(data => { playerStorage = data.storage ?? null; })
				.catch(() => { playerStorage = null; });
		} else {
			playerStorage = null;
		}
	});

	function isActive(href: string): boolean {
		return page.url.pathname.startsWith(href);
	}

	function isLibraryViewActive(view: string): boolean {
		if (!page.url.pathname.startsWith('/library')) return false;
		return (page.url.searchParams.get('view') || 'artists') === view;
	}

	function handlePlayerSelect(playerId: number) {
		onPlayerSelect?.(playerId);
	}

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
	}
</script>

<div class="app-shell">
	<nav class="sidebar">
		<div class="sidebar-top">
			<div class="sidebar-header">
				<a href="/library" class="logo">
					<svg class="logo-mark" viewBox="0 0 24 24" fill="none">
						<circle cx="12" cy="8" r="5.5" fill="#2d2a25" stroke="var(--color-accent)" stroke-width="0.5" opacity="0.85"/>
						<circle cx="12" cy="8" r="3.5" fill="none" stroke="#3a362f" stroke-width="0.4" opacity="0.5"/>
						<circle cx="12" cy="8" r="1.5" fill="var(--color-accent)" opacity="0.9"/>
						<circle cx="12" cy="8" r="0.5" fill="#1a1815"/>
						<rect x="3" y="11" width="18" height="11" rx="1.5" fill="var(--color-accent)" opacity="0.85"/>
						<rect x="3" y="15" width="18" height="0.75" rx="0.375" fill="#1a1815" opacity="0.2"/>
						<rect x="3" y="18.5" width="18" height="0.75" rx="0.375" fill="#1a1815" opacity="0.2"/>
						<rect x="8.5" y="13" width="7" height="1.5" rx="0.75" fill="#1a1815" opacity="0.35"/>
					</svg>
					<span class="logo-text">Crate</span>
				</a>
				{#if players.length > 0}
					<PlayerSelector
						{players}
						{activePlayer}
						onSelect={handlePlayerSelect}
						onAdd={() => window.location.href = '/settings?tab=players'}
						onManage={() => window.location.href = '/settings?tab=players'}
					/>
					{#if playerStorage}
						{@const pct = playerStorage.total > 0 ? Math.min((playerStorage.used / playerStorage.total) * 100, 100) : 0}
						<div class="storage-row">
							<div class="storage-bar">
								<div class="storage-fill" style="width: {pct}%" class:storage-warn={pct > 80} class:storage-full={pct > 95}></div>
							</div>
							<span class="storage-label">{formatBytes(playerStorage.free)} free</span>
						</div>
					{/if}
				{/if}
			</div>

			<ul class="nav-list">
				<li class="nav-section-label">Library</li>
				<li class="nav-section">
					<a
						href="/library"
						class="nav-link"
						class:active={isActive('/library') && (page.url.searchParams.get('view') || 'artists') !== 'player'}
					>
						<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
							<path d="M9 18V5l12-2v13" />
							<circle cx="6" cy="18" r="3" />
							<circle cx="18" cy="16" r="3" />
						</svg>
						<span>Music</span>
					</a>
					{#if isActive('/library') && (page.url.searchParams.get('view') || 'artists') !== 'player'}
						<ul class="sub-nav">
							{#each libraryViews as item}
								<li>
									<a
										href="/library?view={item.view}"
										class="sub-link"
										class:active={isLibraryViewActive(item.view)}
									>
										{item.label}
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				</li>

				<li class="nav-section-label" style="margin-top: 0.75rem">Device</li>
				<li>
					<a
						href="/library?view=player"
						class="nav-link"
						class:active={isActive('/library') && page.url.searchParams.get('view') === 'player'}
					>
						<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
							<rect x="5" y="3" width="14" height="18" rx="3" />
							<circle cx="12" cy="15" r="3" />
							<path d="M9 7h6" />
						</svg>
						<span>Player</span>
					</a>
				</li>
			</ul>
		</div>

		<SyncProgress />

	<div class="sidebar-bottom">
			<ul class="nav-list">
				<li>
					<a
						href="/settings"
						class="nav-link"
						class:active={isActive('/settings')}
					>
						<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="12" cy="12" r="3" />
							<path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
						</svg>
						<span>Settings</span>
					</a>
				</li>
			</ul>
		</div>
	</nav>

	<!-- Mobile top bar -->
	<header class="mobile-topbar">
		<a href="/library" class="logo">
			<svg class="logo-mark" viewBox="0 0 24 24" fill="none">
				<circle cx="12" cy="8" r="5.5" fill="#2d2a25" stroke="var(--color-accent)" stroke-width="0.5" opacity="0.85"/>
				<circle cx="12" cy="8" r="3.5" fill="none" stroke="#3a362f" stroke-width="0.4" opacity="0.5"/>
				<circle cx="12" cy="8" r="1.5" fill="var(--color-accent)" opacity="0.9"/>
				<circle cx="12" cy="8" r="0.5" fill="#1a1815"/>
				<rect x="3" y="11" width="18" height="11" rx="1.5" fill="var(--color-accent)" opacity="0.85"/>
				<rect x="3" y="15" width="18" height="0.75" rx="0.375" fill="#1a1815" opacity="0.2"/>
				<rect x="3" y="18.5" width="18" height="0.75" rx="0.375" fill="#1a1815" opacity="0.2"/>
				<rect x="8.5" y="13" width="7" height="1.5" rx="0.75" fill="#1a1815" opacity="0.35"/>
			</svg>
			<span class="logo-text">Crate</span>
		</a>
		{#if players.length > 0}
			<PlayerSelector
				{players}
				{activePlayer}
				onSelect={handlePlayerSelect}
				onAdd={() => window.location.href = '/settings?tab=players'}
				onManage={() => window.location.href = '/settings?tab=players'}
			/>
		{/if}
	</header>

	<!-- Mobile bottom tab bar -->
	<nav class="mobile-tabbar">
		<a
			href="/library?view=artists"
			class="tab-item"
			class:active={isActive('/library') && ['artists', null].includes(page.url.searchParams.get('view')) && !page.url.pathname.startsWith('/library/album')}
		>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<path d="M9 18V5l12-2v13" />
				<circle cx="6" cy="18" r="3" />
				<circle cx="18" cy="16" r="3" />
			</svg>
			<span>Artists</span>
		</a>
		<a
			href="/library?view=albums"
			class="tab-item"
			class:active={isActive('/library') && (page.url.searchParams.get('view') === 'albums' || page.url.pathname.startsWith('/library/album'))}
		>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<rect x="3" y="3" width="7" height="7" rx="1" />
				<rect x="14" y="3" width="7" height="7" rx="1" />
				<rect x="3" y="14" width="7" height="7" rx="1" />
				<rect x="14" y="14" width="7" height="7" rx="1" />
			</svg>
			<span>Albums</span>
		</a>
		<a
			href="/library?view=player"
			class="tab-item"
			class:active={isActive('/library') && page.url.searchParams.get('view') === 'player'}
		>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<rect x="5" y="3" width="14" height="18" rx="3" />
				<circle cx="12" cy="15" r="3" />
				<path d="M9 7h6" />
			</svg>
			<span>Player</span>
		</a>
		<a
			href="/settings"
			class="tab-item"
			class:active={isActive('/settings')}
		>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="12" cy="12" r="3" />
				<path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
			</svg>
			<span>Settings</span>
		</a>
	</nav>

	<main class="main-content">
		<div class="mobile-sync-progress">
			<SyncProgress />
		</div>
		{@render children()}
	</main>
</div>

<style>
	.app-shell {
		display: flex;
		min-height: 100dvh;
	}

	.sidebar {
		width: 230px;
		flex-shrink: 0;
		background: var(--color-surface);
		border-right: 1px solid var(--color-border-subtle);
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 1.25rem 0;
		position: sticky;
		top: 0;
		height: 100dvh;
		z-index: 10;
	}

	.sidebar-top {
		display: flex;
		flex-direction: column;
	}

	.sidebar-bottom {
		padding-top: 0.75rem;
		border-top: 1px solid var(--color-border-subtle);
	}

	.sidebar-header {
		padding: 0 1.25rem 1.25rem;
		border-bottom: 1px solid var(--color-border-subtle);
		margin-bottom: 1rem;
	}

	/* Logo */
	.logo {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		margin-bottom: 1rem;
		text-decoration: none;
	}

	.logo-mark {
		width: 28px;
		height: 28px;
		flex-shrink: 0;
	}

	.logo-text {
		font-family: var(--font-display);
		font-size: 1.375rem;
		color: var(--color-text);
		letter-spacing: -0.01em;
	}

	/* Storage bar */
	.storage-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.625rem;
	}

	.storage-bar {
		flex: 1;
		height: 3px;
		background: var(--color-border);
		border-radius: 2px;
		overflow: hidden;
	}

	.storage-fill {
		height: 100%;
		background: var(--color-accent-muted);
		border-radius: 2px;
		transition: width 0.3s ease;
	}

	.storage-fill.storage-warn {
		background: var(--color-accent);
	}

	.storage-fill.storage-full {
		background: var(--color-danger);
	}

	.storage-label {
		font-size: 0.625rem;
		color: var(--color-text-faint);
		white-space: nowrap;
		flex-shrink: 0;
	}

	/* Nav */
	.nav-list {
		list-style: none;
		margin: 0;
		padding: 0 0.625rem;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.nav-section {
		display: flex;
		flex-direction: column;
	}

	.nav-section-label {
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-text-faint);
		padding: 0.375rem 0.75rem 0.25rem;
	}

	.nav-link {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius-md);
		color: var(--color-text-muted);
		text-decoration: none;
		font-size: 0.8125rem;
		font-weight: 500;
		transition: color 0.15s, background-color 0.15s;
	}

	.nav-link:hover {
		color: var(--color-text);
		background: var(--color-surface-raised);
	}

	.nav-link.active {
		color: var(--color-accent);
		background: var(--color-accent-soft);
	}

	.nav-icon {
		width: 17px;
		height: 17px;
		flex-shrink: 0;
		opacity: 0.75;
	}

	.nav-link.active .nav-icon {
		opacity: 1;
	}

	/* Sub-navigation */
	.sub-nav {
		list-style: none;
		margin: 2px 0 4px;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.sub-link {
		display: block;
		padding: 0.25rem 0.75rem 0.25rem 2.625rem;
		border-radius: var(--radius-sm);
		color: var(--color-text-faint);
		text-decoration: none;
		font-size: 0.8125rem;
		font-weight: 400;
		transition: color 0.15s, background-color 0.15s;
		position: relative;
	}

	.sub-link:hover {
		color: var(--color-text);
	}

	.sub-link.active {
		color: var(--color-text);
		font-weight: 500;
	}

	.sub-link.active::before {
		content: '';
		position: absolute;
		left: 1.625rem;
		top: 50%;
		transform: translateY(-50%);
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: var(--color-accent);
	}

	.main-content {
		flex: 1;
		min-width: 0;
		padding: 2.25rem 2.75rem;
	}

	/* Mobile top bar — hidden on desktop */
	.mobile-topbar {
		display: none;
	}

	/* Mobile bottom tab bar — hidden on desktop */
	.mobile-tabbar {
		display: none;
	}

	/* Mobile sync progress — hidden on desktop (shown in sidebar) */
	.mobile-sync-progress {
		display: none;
	}

	@media (max-width: 768px) {
		.app-shell {
			flex-direction: column;
			padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 56px);
		}

		/* Hide the desktop sidebar entirely */
		.sidebar {
			display: none;
		}

		/* Mobile top bar */
		.mobile-topbar {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 0.625rem 1rem;
			padding-top: calc(env(safe-area-inset-top, 0px) + 0.625rem);
			background: var(--color-surface);
			border-bottom: 1px solid var(--color-border-subtle);
			position: sticky;
			top: 0;
			z-index: 20;
			gap: 0.75rem;
		}

		.mobile-topbar .logo {
			margin-bottom: 0;
			flex-shrink: 0;
		}

		.mobile-topbar :global(.player-selector) {
			margin-top: 0;
			flex: 1;
			min-width: 0;
		}

		/* Mobile bottom tab bar */
		.mobile-tabbar {
			display: flex;
			position: fixed;
			bottom: 0;
			left: 0;
			right: 0;
			background: var(--color-surface);
			border-top: 1px solid var(--color-border-subtle);
			z-index: 20;
			padding-bottom: env(safe-area-inset-bottom, 0px);
			padding-left: env(safe-area-inset-left, 0px);
			padding-right: env(safe-area-inset-right, 0px);
		}

		.tab-item {
			flex: 1;
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 0.25rem;
			padding: 0.625rem 0 0.375rem;
			text-decoration: none;
			color: var(--color-text-faint);
			font-size: 0.625rem;
			font-weight: 500;
			transition: color 0.15s;
		}

		.tab-item svg {
			width: 20px;
			height: 20px;
		}

		.tab-item.active {
			color: var(--color-accent);
		}

		/* Mobile sync progress — shown above content */
		.mobile-sync-progress {
			display: block;
		}

		.main-content {
			padding: 1.25rem calc(env(safe-area-inset-right, 0px) + 1rem) 1.25rem calc(env(safe-area-inset-left, 0px) + 1rem);
		}
	}
</style>
