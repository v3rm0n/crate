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
		mount_path: string;
		managed_dir: string;
		is_active: number;
		track_count: number;
		total_size: number;
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
						<rect x="2" y="2" width="20" height="20" rx="3" fill="var(--color-accent)" opacity="0.15"/>
						<rect x="5" y="5" width="14" height="14" rx="2" fill="var(--color-accent)" opacity="0.3"/>
						<rect x="8" y="8" width="8" height="8" rx="1.5" fill="var(--color-accent)"/>
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

	<main class="main-content">
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

	@media (max-width: 768px) {
		.app-shell {
			flex-direction: column;
		}

		.sidebar {
			width: 100%;
			height: auto;
			position: static;
			padding: 0.75rem 0;
			border-right: none;
			border-bottom: 1px solid var(--color-border-subtle);
			flex-direction: row;
			justify-content: space-between;
			align-items: center;
			overflow-y: visible;
		}

		.sidebar-top {
			flex-direction: row;
			align-items: center;
			flex: 1;
		}

		.sidebar-bottom {
			padding-top: 0;
			border-top: none;
			padding-right: 0.75rem;
		}

		.sidebar-header {
			padding: 0 0 0 1rem;
			border-bottom: none;
			margin-bottom: 0;
		}

		.logo {
			margin-bottom: 0;
			white-space: nowrap;
		}

		.storage-row {
			display: none;
		}

		.nav-list {
			flex-direction: row;
			padding: 0 0.5rem;
			overflow-x: auto;
		}

		.nav-section-label {
			display: none;
		}

		.sub-nav {
			display: none;
		}

		.nav-link {
			white-space: nowrap;
		}

		.main-content {
			padding: 1.5rem 1rem;
		}
	}
</style>
