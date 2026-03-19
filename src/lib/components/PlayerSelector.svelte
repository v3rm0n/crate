<script lang="ts">
	interface Player {
		id: number;
		name: string;
		mount_path: string;
		managed_dir: string;
		is_active: number;
		track_count: number;
		total_size: number;
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
				<span class="player-name">{activePlayer.name}</span>
				<span class="player-stats">
					{activePlayer.track_count.toLocaleString()} tracks · {formatBytes(activePlayer.total_size)}
				</span>
			</div>
		{:else}
			<span class="no-player">No player selected</span>
		{/if}
		<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M6 9l6 6 6-6" />
		</svg>
	</button>

	{#if isOpen}
		<div class="dropdown">
			<div class="dropdown-header">
				<span class="header-label">Select Player</span>
				<button type="button" class="manage-link" onclick={onManage}>
					Manage players
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
							onclick={() => handleSelect(player.id)}
						>
							<div class="option-info">
								<span class="option-name">{player.name}</span>
								<span class="option-stats">
									{player.track_count.toLocaleString()} tracks · {formatBytes(player.total_size)}
								</span>
							</div>
							{#if player.id === activePlayer?.id}
								<svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
	}

	.selector-button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: all 0.15s ease;
		min-width: 200px;
	}

	.selector-button:hover {
		border-color: var(--color-primary);
	}

	.selector-button.active {
		border-color: var(--color-primary);
		box-shadow: 0 0 0 2px var(--color-primary-light);
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
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 180px;
	}

	.player-stats {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.no-player {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		flex: 1;
	}

	.chevron {
		width: 16px;
		height: 16px;
		color: var(--color-text-secondary);
		flex-shrink: 0;
	}

	.dropdown {
		position: absolute;
		top: calc(100% + 0.5rem);
		right: 0;
		min-width: 280px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		z-index: 100;
	}

	.dropdown-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--color-border);
	}

	.header-label {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		color: var(--color-text-secondary);
		letter-spacing: 0.025em;
	}

	.manage-link {
		font-size: 0.75rem;
		color: var(--color-primary);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
	}

	.manage-link:hover {
		text-decoration: underline;
	}

	.players-list {
		max-height: 300px;
		overflow-y: auto;
	}

	.empty-state {
		padding: 1.5rem;
		text-align: center;
		color: var(--color-text-secondary);
	}

	.empty-state p {
		font-size: 0.875rem;
		margin: 0;
	}

	.player-option {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0.75rem 1rem;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		transition: background-color 0.15s ease;
	}

	.player-option:hover {
		background: var(--color-surface-hover);
	}

	.player-option.active {
		background: var(--color-primary-light);
	}

	.option-info {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}

	.option-name {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 200px;
	}

	.option-stats {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.check-icon {
		width: 16px;
		height: 16px;
		color: var(--color-primary);
		flex-shrink: 0;
	}

	.dropdown-footer {
		padding: 0.75rem;
		border-top: 1px solid var(--color-border);
	}

	.add-button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem;
		font-size: 0.875rem;
		color: var(--color-primary);
		background: var(--color-primary-light);
		border: 1px dashed var(--color-primary);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.add-button:hover {
		background: var(--color-primary);
		color: white;
	}

	.add-button svg {
		width: 16px;
		height: 16px;
	}
</style>