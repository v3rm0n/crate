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

	const navItems = [
		{ href: '/library', label: 'Music', icon: 'library' },
		{ href: '/settings', label: 'Settings', icon: 'settings' }
	];

	function isActive(href: string): boolean {
		return page.url.pathname.startsWith(href);
	}

	function handlePlayerSelect(playerId: number) {
		onPlayerSelect?.(playerId);
	}
</script>

<div class="app-shell">
	<nav class="sidebar">
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
			{/if}
		</div>

		<ul class="nav-list">
			{#each navItems as item}
				<li>
					<a
						href={item.href}
						class="nav-link"
						class:active={isActive(item.href)}
					>
						<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
							{#if item.icon === 'library'}
								<path d="M4 6h16M4 10h16M4 14h10M4 18h7" />
							{:else if item.icon === 'player'}
								<rect x="2" y="4" width="20" height="16" rx="2" />
								<circle cx="12" cy="12" r="3" />
								<path d="M6 8h2M16 8h2" />
							{:else if item.icon === 'settings'}
								<circle cx="12" cy="12" r="3" />
								<path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
							{/if}
						</svg>
						<span>{item.label}</span>
					</a>
				</li>
			{/each}
		</ul>
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
		padding: 1.25rem 0;
		position: sticky;
		top: 0;
		height: 100dvh;
	}

	.sidebar-header {
		padding: 0 1.25rem 1.5rem;
		border-bottom: 1px solid var(--color-border-subtle);
		margin-bottom: 0.75rem;
	}

	.logo {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 400;
		letter-spacing: 0.01em;
		color: var(--color-text);
		margin: 0;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.logo-icon {
		color: var(--color-accent);
		font-size: 0.875rem;
	}

	.nav-list {
		list-style: none;
		margin: 0;
		padding: 0 0.625rem;
		display: flex;
		flex-direction: column;
		gap: 2px;
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
		}

		.sidebar-header {
			padding: 0 1rem 0.75rem;
			margin-bottom: 0.5rem;
		}

		.nav-list {
			flex-direction: row;
			padding: 0 0.75rem;
			overflow-x: auto;
		}

		.nav-link {
			white-space: nowrap;
		}

		.main-content {
			padding: 1.5rem 1rem;
		}
	}
</style>