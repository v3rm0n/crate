<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import PlayerSelector from './PlayerSelector.svelte';

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
				<h1 class="logo">
					<span class="logo-icon">◆</span>
					Crate
				</h1>
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
								<div class="storage-fill" style="width: {pct}%" class:storage-full={pct > 90}></div>
							</div>
							<span class="storage-label">{formatBytes(playerStorage.free)} free</span>
						</div>
					{/if}
				{/if}
			</div>

			<ul class="nav-list">
				<li class="nav-section">
					<a
						href="/library"
						class="nav-link"
						class:active={isActive('/library') && (page.url.searchParams.get('view') || 'artists') !== 'player'}
					>
						<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
							<path d="M4 6h16M4 10h16M4 14h10M4 18h7" />
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
		width: 220px;
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
		margin-bottom: 0.75rem;
	}

	.logo {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 400;
		letter-spacing: 0.01em;
		color: var(--color-text);
		margin: 0 0 0.875rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.logo-icon {
		color: var(--color-accent);
		font-size: 0.875rem;
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
		gap: 2px;
	}

	.nav-section {
		display: flex;
		flex-direction: column;
	}

	.nav-link {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.5rem 0.625rem;
		border-radius: 6px;
		color: var(--color-text-muted);
		text-decoration: none;
		font-size: 0.875rem;
		font-weight: 500;
		transition: color 0.15s, background-color 0.15s;
	}

	.nav-link:hover {
		color: var(--color-text);
		background: var(--color-surface-raised);
	}

	.nav-link.active {
		color: var(--color-accent);
		background: rgba(212, 168, 67, 0.08);
	}

	.nav-icon {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
	}

	/* Sub-navigation */
	.sub-nav {
		list-style: none;
		margin: 2px 0 4px;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.sub-link {
		display: block;
		padding: 0.3125rem 0.625rem 0.3125rem 2.5rem;
		border-radius: 5px;
		color: var(--color-text-faint);
		text-decoration: none;
		font-size: 0.8125rem;
		font-weight: 400;
		transition: color 0.15s, background-color 0.15s;
	}

	.sub-link:hover {
		color: var(--color-text);
		background: var(--color-surface-raised);
	}

	.sub-link.active {
		color: var(--color-text);
		background: var(--color-surface-raised);
		font-weight: 500;
	}

	.main-content {
		flex: 1;
		min-width: 0;
		padding: 2rem 2.5rem;
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
