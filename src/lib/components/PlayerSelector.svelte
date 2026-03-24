<script lang="ts">
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

	interface Props {
		players: Player[];
		activePlayer: Player | null;
		onSelect: (playerId: number) => void;
		onAdd: () => void;
		onManage: () => void;
	}

	let { players, activePlayer, onSelect, onAdd, onManage }: Props = $props();

	let isOpen = $state(false);

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
	}

	function handleSelect(playerId: number) {
		onSelect(playerId);
		isOpen = false;
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.player-selector')) {
			isOpen = false;
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div class="player-selector">
	<button
		type="button"
		class="selector-button"
		class:active={isOpen}
		onclick={() => isOpen = !isOpen}
		aria-expanded={isOpen}
	>
		{#if activePlayer}
			<div class="player-info">
				<span class="player-name">
					{#if !activePlayer.is_mounted}<span class="disconnected-dot"></span>{/if}
					{activePlayer.name}
				</span>
				<span class="player-stats">
					{#if activePlayer.is_mounted}
						{activePlayer.track_count.toLocaleString()} tracks · {formatBytes(activePlayer.total_size)}
					{:else}
						Disconnected
					{/if}
				</span>
			</div>
		{:else}
			<span class="no-player">No player selected</span>
		{/if}
		<svg class="chevron" class:open={isOpen} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M6 9l6 6 6-6" />
		</svg>
	</button>

	{#if isOpen}
		<div class="dropdown">
			<div class="dropdown-header">
				<span class="header-label">Select Player</span>
				<button type="button" class="manage-link" onclick={onManage}>
					Manage
				</button>
			</div>

			<div class="players-list">
				{#if players.length === 0}
					<div class="empty-state">
						<p>No players configured</p>
					</div>
				{:else}
					{#each players as player}
						<button
							type="button"
							class="player-option"
							class:active={player.id === activePlayer?.id}
							class:disconnected={!player.is_mounted}
							onclick={() => handleSelect(player.id)}
						>
							<div class="option-info">
								<span class="option-name">
									{#if !player.is_mounted}<span class="disconnected-dot"></span>{/if}
									{player.name}
								</span>
								<span class="option-stats">
									{#if player.is_mounted}
										{player.track_count.toLocaleString()} tracks · {formatBytes(player.total_size)}
									{:else}
										Disconnected
									{/if}
								</span>
							</div>
							{#if player.id === activePlayer?.id}
								<svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
									<path d="M5 13l4 4L19 7" />
								</svg>
							{/if}
						</button>
					{/each}
				{/if}
			</div>

			<div class="dropdown-footer">
				<button type="button" class="add-button" onclick={onAdd}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M12 5v14M5 12h14" />
					</svg>
					Add new player
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.player-selector {
		position: relative;
		margin-top: 0.75rem;
	}

	.selector-button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: all 0.15s ease;
		width: 100%;
		font-family: inherit;
	}

	.selector-button:hover {
		border-color: var(--color-accent-muted);
	}

	.selector-button.active {
		border-color: var(--color-accent-muted);
		box-shadow: 0 0 0 2px rgba(196, 154, 60, 0.12);
	}

	.player-info {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.125rem;
		flex: 1;
		min-width: 0;
	}

	.player-name {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--color-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 140px;
	}

	.player-stats {
		font-size: 0.6875rem;
		color: var(--color-text-muted);
	}

	.no-player {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		flex: 1;
	}

	.chevron {
		width: 14px;
		height: 14px;
		color: var(--color-text-faint);
		flex-shrink: 0;
		transition: transform 0.15s;
	}

	.chevron.open {
		transform: rotate(180deg);
	}

	.dropdown {
		position: absolute;
		top: calc(100% + 0.375rem);
		left: 0;
		right: 0;
		min-width: 240px;
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		z-index: 100;
		overflow: hidden;
	}

	.dropdown-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.625rem 0.75rem;
		border-bottom: 1px solid var(--color-border-subtle);
	}

	.header-label {
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		color: var(--color-text-faint);
		letter-spacing: 0.08em;
	}

	.manage-link {
		font-size: 0.6875rem;
		color: var(--color-accent);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		font-family: inherit;
		transition: opacity 0.15s;
	}

	.manage-link:hover {
		opacity: 0.8;
	}

	.players-list {
		max-height: 300px;
		overflow-y: auto;
	}

	.empty-state {
		padding: 1.5rem;
		text-align: center;
		color: var(--color-text-muted);
	}

	.empty-state p {
		font-size: 0.8125rem;
		margin: 0;
	}

	.player-option {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0.5rem 0.75rem;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		transition: background-color 0.1s ease;
		font-family: inherit;
	}

	.player-option:hover {
		background: var(--color-surface-hover);
	}

	.player-option.active {
		background: var(--color-accent-soft);
	}

	.option-info {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}

	.option-name {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--color-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 160px;
	}

	.option-stats {
		font-size: 0.6875rem;
		color: var(--color-text-muted);
	}

	.disconnected-dot {
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--color-error, #e55);
		margin-right: 0.25rem;
		vertical-align: middle;
	}

	.player-option.disconnected {
		opacity: 0.6;
	}

	.check-icon {
		width: 14px;
		height: 14px;
		color: var(--color-accent);
		flex-shrink: 0;
	}

	.dropdown-footer {
		padding: 0.5rem;
		border-top: 1px solid var(--color-border-subtle);
	}

	.add-button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		width: 100%;
		padding: 0.4375rem;
		font-size: 0.8125rem;
		color: var(--color-accent);
		background: transparent;
		border: 1px dashed var(--color-accent-muted);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: inherit;
	}

	.add-button:hover {
		background: var(--color-accent-soft);
		border-color: var(--color-accent);
	}

	.add-button svg {
		width: 14px;
		height: 14px;
	}

	@media (max-width: 768px) {
		.dropdown {
			position: absolute;
			top: calc(100% + 0.375rem);
			left: 0;
			right: 0;
			min-width: 240px;
		}

		.player-name {
			max-width: none;
		}
	}
</style>
