<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';

	interface CronStatus {
		enabled: boolean;
		intervalMinutes: number;
		running: boolean;
		lastRunAt: string | null;
		lastRunStatus: string | null;
		lastRunError: string | null;
		nextRunAt: string | null;
	}

	interface Settings {
		setupComplete: boolean;
		managedDir: string | null;
		libraryPath: string;
		playerMountBase: string;
		cron: CronStatus;
	}

	interface Job {
		id: number;
		type: string;
		status: string;
		progress: number;
		total: number;
		started_at: string;
		finished_at: string | null;
		error: string | null;
	}

	interface Player {
		id: number;
		name: string;
		alias: string;
		mount_path: string;
		managed_dir: string;
		track_count: number;
		total_size: number;
		is_active: boolean;
		is_mounted: boolean;
	}

	interface DiscoveredDevice {
		name: string;
		path: string;
	}

	interface PlayersData {
		players: Player[];
		mountBase: string;
		discoveredDevices: DiscoveredDevice[];
	}

	let settings = $state<Settings | null>(null);
	let jobs = $state<Job[]>([]);
	let scanning = $state<'library' | 'player' | null>(null);
	let scanProgress = $state('');

	// Tab state
	let activeTab = $state<'general' | 'players'>('general');

	// Players state
	let playersData = $state<PlayersData | null>(null);
	let showAddPlayerModal = $state(false);
	let addPlayerStep = $state<1 | 2 | 3 | 4>(1);
	let mountBaseInput = $state('');
	let selectedDevice: DiscoveredDevice | null = $state(null);
	let managedDirInput = $state('');
	let playerNameInput = $state('');
	let playerAliasInput = $state('');
	let availableDirectories = $state<{ name: string; path: string }[]>([]);
	let loadingDirectories = $state(false);
	let savingPlayer = $state(false);
	let newDirInput = $state('');
	let creatingDir = $state(false);
	let editingPlayer: Player | null = $state(null);
	let showDeleteConfirm: number | null = $state(null);

	async function loadData() {
		const [settingsRes, jobsRes] = await Promise.all([
			fetch('/api/settings'),
			fetch('/api/jobs')
		]);
		settings = await settingsRes.json();
		const jobsData = await jobsRes.json();
		jobs = jobsData.jobs;
	}

	async function loadPlayers() {
		const res = await fetch('/api/players');
		playersData = await res.json();
		if (playersData?.mountBase) {
			mountBaseInput = playersData.mountBase;
		}
	}

	async function triggerScan(type: 'library' | 'player') {
		scanning = type;
		scanProgress = 'Starting scan...';

		const eventSource = new EventSource(`/api/scan/${type}`);

		eventSource.onmessage = (event) => {
			const data = JSON.parse(event.data);
			if (data.phase === 'discovering') {
				scanProgress = 'Discovering files...';
			} else if (data.phase === 'scanning') {
				scanProgress = `Scanning: ${data.current}/${data.total}`;
			} else if (data.phase === 'complete') {
				scanProgress = `Complete: ${data.total} files processed`;
				scanning = null;
				eventSource.close();
				loadData();
			} else if (data.phase === 'error') {
				scanProgress = `Error: ${data.error}`;
				scanning = null;
				eventSource.close();
			}
		};

		eventSource.onerror = () => {
			scanProgress = 'Connection lost';
			scanning = null;
			eventSource.close();
		};
	}

	async function updateMountBase() {
		const res = await fetch('/api/players', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ mountBase: mountBaseInput })
		});
		if (res.ok) {
			await loadPlayers();
			addPlayerStep = 2;
		}
	}

	async function selectDevice(device: DiscoveredDevice) {
		selectedDevice = device;
		managedDirInput = '';
		availableDirectories = [];
		loadingDirectories = true;
		addPlayerStep = 3;

		try {
			const res = await fetch('/api/players/browse', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path: device.path })
			});
			const data = await res.json();
			availableDirectories = data.directories || [];
		} finally {
			loadingDirectories = false;
		}
	}

	async function browseDirectories(absolutePath: string, relativePath: string) {
		loadingDirectories = true;
		try {
			const res = await fetch('/api/players/browse', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path: absolutePath })
			});
			const data = await res.json();
			availableDirectories = data.directories || [];
			managedDirInput = relativePath;
		} finally {
			loadingDirectories = false;
		}
	}

	async function createDirectory() {
		if (!newDirInput.trim() || !selectedDevice) return;
		creatingDir = true;
		try {
			const parentPath = managedDirInput
				? `${selectedDevice.path}/${managedDirInput}`
				: selectedDevice.path;
			const res = await fetch('/api/players/browse', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path: parentPath, name: newDirInput.trim() })
			});
			if (res.ok) {
				const newRelative = managedDirInput
					? `${managedDirInput}/${newDirInput.trim()}`
					: newDirInput.trim();
				const newAbsolute = `${parentPath}/${newDirInput.trim()}`;
				newDirInput = '';
				await browseDirectories(newAbsolute, newRelative);
			}
		} finally {
			creatingDir = false;
		}
	}

	function confirmManagedDir() {
		playerNameInput = selectedDevice?.name || '';
		addPlayerStep = 4;
	}

	async function savePlayer() {
		savingPlayer = true;
		try {
			const body = {
				name: playerNameInput,
				mountPath: selectedDevice!.path,
				managedDir: managedDirInput
			};

			const res = await fetch('/api/players', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (res.ok) {
				closeAddPlayerModal();
				await loadPlayers();
				await invalidateAll();
			}
		} finally {
			savingPlayer = false;
		}
	}

	async function updatePlayer() {
		if (!editingPlayer) return;
		savingPlayer = true;
		try {
			const res = await fetch(`/api/players/${editingPlayer.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: playerNameInput,
					alias: playerAliasInput,
					managed_dir: managedDirInput
				})
			});

			if (res.ok) {
				closeAddPlayerModal();
				await loadPlayers();
			}
		} finally {
			savingPlayer = false;
		}
	}

	async function activatePlayer(id: number) {
		const res = await fetch(`/api/players/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'activate' })
		});
		if (res.ok) {
			await loadPlayers();
			await loadData();
			await invalidateAll();
		}
	}

	async function deletePlayer(id: number) {
		const res = await fetch(`/api/players/${id}`, {
			method: 'DELETE'
		});
		if (res.ok) {
			showDeleteConfirm = null;
			await loadPlayers();
			await loadData();
			await invalidateAll();
		}
	}

	async function openAddPlayerModal() {
		editingPlayer = null;
		addPlayerStep = 1;
		selectedDevice = null;
		managedDirInput = '';
		playerNameInput = '';
		playerAliasInput = '';
		newDirInput = '';
		availableDirectories = [];
		if (playersData?.mountBase) {
			mountBaseInput = playersData.mountBase;
			await loadPlayers();
			addPlayerStep = 2;
		}
		showAddPlayerModal = true;
	}

	function openEditPlayerModal(player: Player) {
		editingPlayer = player;
		playerNameInput = player.name;
		playerAliasInput = player.alias || '';
		managedDirInput = player.managed_dir;
		addPlayerStep = 4;
		showAddPlayerModal = true;
	}

	function closeAddPlayerModal() {
		showAddPlayerModal = false;
		editingPlayer = null;
		addPlayerStep = 1;
		selectedDevice = null;
		managedDirInput = '';
		playerNameInput = '';
		playerAliasInput = '';
		newDirInput = '';
		availableDirectories = [];
	}

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
	}

	function formatDate(dateStr: string | null): string {
		if (!dateStr) return '-';
		const d = new Date(dateStr + 'Z');
		return d.toLocaleString();
	}

	function jobTypeLabel(type: string): string {
		const labels: Record<string, string> = {
			library_scan: 'Library scan',
			player_scan: 'Player scan',
			sync: 'Sync',
			migrate: 'Migration'
		};
		return labels[type] || type;
	}

	onMount(() => {
		const urlTab = new URLSearchParams(window.location.search).get('tab');
		if (urlTab === 'players') activeTab = 'players';
		loadData();
		loadPlayers();
	});
</script>

<div class="settings-page">
	<header class="page-header">
		<h1>Settings</h1>
		<div class="tabs">
			<button
				class="tab"
				class:active={activeTab === 'general'}
				onclick={() => activeTab = 'general'}
			>
				General
			</button>
			<button
				class="tab"
				class:active={activeTab === 'players'}
				onclick={() => activeTab = 'players'}
			>
				Players
				{#if playersData?.players}
					<span class="tab-badge">{playersData.players.length}</span>
				{/if}
			</button>
		</div>
	</header>

	{#if activeTab === 'general'}
		{#if settings}
			<!-- Configuration -->
			<section class="section">
				<h2 class="section-title">Configuration</h2>
				<div class="settings-list">
					<div class="setting-row">
						<span class="setting-label">Library path</span>
						<code class="setting-value">{settings.libraryPath}</code>
					</div>
					<div class="setting-row">
						<span class="setting-label">Player mount base</span>
						<code class="setting-value">{settings.playerMountBase}</code>
					</div>
				</div>
			</section>

			<!-- Auto-scan -->
			<section class="section">
				<h2 class="section-title">Auto-scan</h2>
				<div class="settings-list">
					<div class="setting-row">
						<span class="setting-label">Status</span>
						{#if settings.cron.enabled}
							<span class="cron-status cron-enabled">
								Every {settings.cron.intervalMinutes} min
							</span>
						{:else}
							<span class="cron-status cron-disabled">Disabled</span>
						{/if}
					</div>
					{#if settings.cron.enabled}
						<div class="setting-row">
							<span class="setting-label">Current</span>
							{#if settings.cron.running}
								<span class="cron-status cron-running">
									<span class="spinner-small"></span>
									Scanning...
								</span>
							{:else}
								<span class="setting-value-text">Idle</span>
							{/if}
						</div>
						{#if settings.cron.lastRunAt}
							<div class="setting-row">
								<span class="setting-label">Last run</span>
								<span class="setting-value-text">
									{formatDate(settings.cron.lastRunAt.replace('Z', '').replace('T', ' ').slice(0, 19))}
									{#if settings.cron.lastRunStatus === 'success'}
										<span class="cron-badge cron-success">OK</span>
									{:else if settings.cron.lastRunStatus === 'failed'}
										<span class="cron-badge cron-failed">Failed</span>
									{/if}
								</span>
							</div>
						{/if}
						{#if settings.cron.lastRunError}
							<div class="setting-row">
								<span class="setting-label">Error</span>
								<span class="setting-value-error">{settings.cron.lastRunError}</span>
							</div>
						{/if}
					{:else}
						<div class="setting-row">
							<span class="setting-label-hint">
								Set <code>SCAN_INTERVAL</code> env var (minutes) to enable
							</span>
						</div>
					{/if}
				</div>
			</section>

			<!-- Scanning -->
			<section class="section">
				<h2 class="section-title">Manual scanning</h2>

				{#if scanning}
					<div class="scan-progress">
						<div class="spinner-small"></div>
						<span>{scanProgress}</span>
					</div>
				{/if}

				<div class="scan-actions">
					<button
						class="scan-btn"
						disabled={scanning !== null}
						onclick={() => triggerScan('library')}
					>
						<strong>Rescan library</strong>
						<span>Index new/changed files in the music library</span>
					</button>
					<button
						class="scan-btn"
						disabled={scanning !== null}
						onclick={() => triggerScan('player')}
					>
						<strong>Rescan player</strong>
						<span>Re-index files on the player and update sync status</span>
					</button>
				</div>
			</section>
		{/if}

		<!-- Job history -->
		<section class="section">
			<h2 class="section-title">Recent jobs</h2>
			{#if jobs.length === 0}
				<p class="empty-text">No jobs yet</p>
			{:else}
				<div class="job-list">
					{#each jobs as job}
						<div class="job-row">
							<div class="job-info">
								<span class="job-type">{jobTypeLabel(job.type)}</span>
								<span class="job-time">{formatDate(job.started_at)}</span>
							</div>
							<div class="job-status-row">
								<span
									class="job-status"
									class:running={job.status === 'running'}
									class:completed={job.status === 'completed'}
									class:failed={job.status === 'failed'}
								>
									{job.status}
								</span>
								{#if job.total > 0}
									<span class="job-progress">{job.progress}/{job.total}</span>
								{/if}
							</div>
							{#if job.error}
								<span class="job-error">{job.error}</span>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{:else if activeTab === 'players'}
		<section class="section">
			<div class="section-header">
				<h2 class="section-title">Configured Players</h2>
				<button class="btn-primary" onclick={openAddPlayerModal}>
					Add Player
				</button>
			</div>

			{#if !playersData}
				<div class="loading-state">
					<div class="spinner"></div>
				</div>
			{:else if playersData.players.length === 0}
				<div class="empty-state">
					<p>No players configured</p>
					<p class="hint">Add a player to manage music on portable devices</p>
				</div>
			{:else}
				<div class="player-list">
					{#each playersData.players as player}
						<div class="player-card" class:active={player.is_active} class:disconnected={!player.is_mounted}>
							<div class="player-info">
								<div class="player-header">
									<span class="player-name">
										{player.alias || player.name}
										{#if player.is_active}
											<span class="active-badge">Active</span>
										{/if}
										{#if !player.is_mounted}
											<span class="disconnected-badge">Disconnected</span>
										{/if}
									</span>
								</div>
								<div class="player-paths">
									<code class="path-value">{player.mount_path}</code>
									<span class="path-separator">→</span>
									<code class="path-value">{player.managed_dir}</code>
								</div>
								{#if player.is_mounted}
								<div class="player-stats">
									<span class="stat">
										<strong>{player.track_count}</strong> tracks
									</span>
									<span class="stat-separator">·</span>
									<span class="stat">
										<strong>{formatBytes(player.total_size)}</strong>
									</span>
								</div>
							{/if}
							</div>
							<div class="player-actions">
								{#if !player.is_active && player.is_mounted}
									<button
										class="btn-action-small"
										onclick={() => activatePlayer(player.id)}
									>
										Set Active
									</button>
								{/if}
								<button
									class="btn-ghost-small"
									onclick={() => openEditPlayerModal(player)}
								>
									Edit
								</button>
								<button
									class="btn-danger-small"
									onclick={() => showDeleteConfirm = player.id}
								>
									Delete
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</div>

<!-- Add/Edit Player Modal -->
{#if showAddPlayerModal}
	<div class="modal-backdrop" onclick={closeAddPlayerModal}>
		<div class="modal" onclick={(e) => e.stopPropagation()}>
			{#if editingPlayer}
				<h3 class="modal-title">Edit Player</h3>
			{:else}
				<h3 class="modal-title">Add Player</h3>
				<div class="modal-steps">
					<span class="step" class:active={addPlayerStep === 1}>1</span>
					<span class="step-divider"></span>
					<span class="step" class:active={addPlayerStep === 2}>2</span>
					<span class="step-divider"></span>
					<span class="step" class:active={addPlayerStep === 3}>3</span>
					<span class="step-divider"></span>
					<span class="step" class:active={addPlayerStep === 4}>4</span>
				</div>
			{/if}

			{#if editingPlayer}
				<div class="modal-body">
					<div class="form-group">
						<label>Player name</label>
						<input
							type="text"
							bind:value={playerNameInput}
							placeholder="My iPod"
						/>
					</div>
					<div class="form-group">
						<label>Alias</label>
						<input
							type="text"
							bind:value={playerAliasInput}
							placeholder="e.g. iPod Classic 7th Gen"
						/>
						<p class="form-hint">
							Shown instead of mount path in the UI. Leave empty to show the path.
						</p>
					</div>
					<div class="form-group">
						<label>Managed directory</label>
						<input
							type="text"
							bind:value={managedDirInput}
							placeholder="/music"
						/>
						<p class="form-hint">
							Path relative to the mount point
						</p>
					</div>
				</div>
				<div class="modal-actions">
					<button class="btn-cancel" onclick={closeAddPlayerModal}>Cancel</button>
					<button
						class="btn-confirm"
						onclick={updatePlayer}
						disabled={savingPlayer || !playerNameInput.trim()}
					>
						{savingPlayer ? 'Saving...' : 'Save Changes'}
					</button>
				</div>
			{:else if addPlayerStep === 1}
				<div class="modal-body">
					<p class="modal-description">
						Configure the base path where player drives are mounted.
					</p>
					<div class="form-group">
						<label>Mount base path</label>
						<input
							type="text"
							bind:value={mountBaseInput}
							placeholder="/mnt/disks"
						/>
					</div>
				</div>
				<div class="modal-actions">
					<button class="btn-cancel" onclick={closeAddPlayerModal}>Cancel</button>
					<button
						class="btn-confirm"
						onclick={updateMountBase}
						disabled={!mountBaseInput.trim()}
					>
						Next
					</button>
				</div>
			{:else if addPlayerStep === 2}
				<div class="modal-body">
					<p class="modal-description">
						Select a discovered device from the list below.
					</p>
					{#if !playersData?.discoveredDevices?.length}
						<div class="empty-state small">
							<p>No devices found</p>
							<p class="hint">
								Make sure your player is mounted at {mountBaseInput}
							</p>
						</div>
					{:else}
						<div class="device-list">
							{#each playersData.discoveredDevices as device}
								<button
									class="device-option"
									onclick={() => selectDevice(device)}
								>
									<span class="device-name">{device.name}</span>
									<span class="device-path">{device.path}</span>
								</button>
							{/each}
						</div>
					{/if}
				</div>
				<div class="modal-actions">
					<button class="btn-cancel" onclick={() => addPlayerStep = 1}>Back</button>
					<button class="btn-cancel" onclick={closeAddPlayerModal}>Cancel</button>
				</div>
			{:else if addPlayerStep === 3}
				<div class="modal-body">
					<p class="modal-description">
						Choose the managed directory within <strong>{selectedDevice?.name}</strong>.
					</p>
					<div class="directory-browser">
						<div class="current-path">
							<span class="path-label">Current:</span>
							<code>{managedDirInput || '/ (root)'}</code>
							{#if managedDirInput && selectedDevice}
								<button
									class="btn-up"
									onclick={() => {
										const dev = selectedDevice;
										if (!dev) return;
										const parts = managedDirInput.split('/');
										parts.pop();
										const parentRelative = parts.join('/');
										const parentAbsolute = parentRelative
											? `${dev.path}/${parentRelative}`
											: dev.path;
										browseDirectories(parentAbsolute, parentRelative);
									}}
								>
									Up
								</button>
							{/if}
						</div>
						{#if loadingDirectories}
							<div class="loading-dirs">
								<div class="spinner-small"></div>
								<span>Loading...</span>
							</div>
						{:else}
							{#if availableDirectories.length > 0}
								<div class="directory-list">
									{#each availableDirectories as dir}
										{@const relativePath = selectedDevice ? dir.path.slice(selectedDevice.path.length).replace(/^\//, '') : dir.name}
										<button
											class="directory-option"
											onclick={() => browseDirectories(dir.path, relativePath)}
										>
											<span class="dir-name">{dir.name}</span>
										</button>
									{/each}
								</div>
							{:else}
								<p class="no-dirs">No subdirectories</p>
							{/if}
							<div class="create-dir-row">
								<input
									type="text"
									bind:value={newDirInput}
									placeholder="New folder name"
									onkeydown={(e) => { if (e.key === 'Enter') createDirectory(); }}
								/>
								<button
									class="btn-create-dir"
									onclick={createDirectory}
									disabled={creatingDir || !newDirInput.trim()}
								>
									{creatingDir ? 'Creating...' : 'Create'}
								</button>
							</div>
						{/if}
					</div>
					<div class="selected-path">
						<span class="path-label">Selected:</span>
						<code>{managedDirInput || '/ (root of device)'}</code>
					</div>
				</div>
				<div class="modal-actions">
					<button class="btn-cancel" onclick={() => addPlayerStep = 2}>Back</button>
					<button class="btn-cancel" onclick={closeAddPlayerModal}>Cancel</button>
					<button
						class="btn-confirm"
						onclick={confirmManagedDir}
					>
						Next
					</button>
				</div>
			{:else if addPlayerStep === 4}
				<div class="modal-body">
					<p class="modal-description">
						Give your player a memorable name.
					</p>
					<div class="form-group">
						<label>Player name</label>
						<input
							type="text"
							bind:value={playerNameInput}
							placeholder="My iPod"
						/>
					</div>
					<div class="summary">
						<div class="summary-row">
							<span class="summary-label">Mount:</span>
							<code>{selectedDevice?.path}</code>
						</div>
						<div class="summary-row">
							<span class="summary-label">Directory:</span>
							<code>{managedDirInput}</code>
						</div>
					</div>
				</div>
				<div class="modal-actions">
					<button class="btn-cancel" onclick={() => addPlayerStep = 3}>Back</button>
					<button class="btn-cancel" onclick={closeAddPlayerModal}>Cancel</button>
					<button
						class="btn-confirm"
						onclick={savePlayer}
						disabled={savingPlayer || !playerNameInput.trim()}
					>
						{savingPlayer ? 'Saving...' : 'Add Player'}
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<!-- Delete Confirmation Modal -->
{#if showDeleteConfirm}
	<div class="modal-backdrop" onclick={() => showDeleteConfirm = null}>
		<div class="modal" onclick={(e) => e.stopPropagation()}>
			<h3 class="modal-title danger">Delete Player</h3>
			<p class="modal-description">
				Are you sure you want to delete this player configuration?
				This will not delete any files from the device.
			</p>
			<div class="modal-actions">
				<button class="btn-cancel" onclick={() => showDeleteConfirm = null}>Cancel</button>
				<button
					class="btn-confirm-delete"
					onclick={() => showDeleteConfirm && deletePlayer(showDeleteConfirm)}
				>
					Delete
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.settings-page { max-width: 700px; }

	.page-header h1 {
		font-family: var(--font-display);
		font-size: 1.75rem;
		font-weight: 400;
		margin: 0 0 1rem;
		letter-spacing: -0.01em;
	}

	/* Tabs */
	.tabs {
		display: flex;
		gap: 2px;
		background: var(--color-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-md);
		padding: 3px;
		width: fit-content;
		margin-bottom: 2rem;
	}

	.tab {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		border-radius: 5px;
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
		box-shadow: var(--shadow-sm);
	}

	.tab-badge {
		font-size: 0.6875rem;
		padding: 0.0625rem 0.375rem;
		background: var(--color-accent);
		color: #1a1815;
		border-radius: 10px;
		font-weight: 600;
	}

	.section { margin-bottom: 2.5rem; }

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}

	.section-title {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-muted);
		margin: 0;
	}

	/* Settings */
	.settings-list {
		background: var(--color-surface);
		border-radius: var(--radius-lg);
		overflow: hidden;
		border: 1px solid var(--color-border-subtle);
	}

	.setting-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1.25rem;
		border-bottom: 1px solid var(--color-border-subtle);
	}

	.setting-row:last-child { border-bottom: none; }

	.setting-label {
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}

	.setting-value {
		font-size: 0.8125rem;
		background: var(--color-bg);
		padding: 0.1875rem 0.5rem;
		border-radius: 3px;
		color: var(--color-text);
	}

	/* Auto-scan */
	.cron-status {
		font-size: 0.8125rem;
		font-weight: 500;
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.cron-enabled { color: var(--color-synced); }
	.cron-disabled { color: var(--color-text-faint); }
	.cron-running { color: var(--color-accent); }

	.cron-badge {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.0625rem 0.375rem;
		border-radius: 3px;
		margin-left: 0.375rem;
	}

	.cron-success {
		color: var(--color-synced);
		background: rgba(76, 175, 106, 0.1);
	}

	.cron-failed {
		color: var(--color-danger);
		background: rgba(212, 80, 80, 0.1);
	}

	.setting-value-text {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		display: flex;
		align-items: center;
	}

	.setting-value-error {
		font-size: 0.8125rem;
		color: var(--color-danger);
	}

	.setting-label-hint {
		font-size: 0.8125rem;
		color: var(--color-text-faint);
	}

	.setting-label-hint code {
		background: var(--color-bg);
		padding: 0.125rem 0.375rem;
		border-radius: 3px;
		font-size: 0.75rem;
	}

	/* Scan */
	.scan-progress {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.625rem 0;
		font-size: 0.875rem;
		color: var(--color-accent);
		margin-bottom: 0.75rem;
	}

	.spinner-small {
		width: 16px;
		height: 16px;
		border: 2px solid var(--color-border);
		border-top-color: var(--color-accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin { to { transform: rotate(360deg); } }

	.scan-actions {
		display: flex;
		gap: 0.75rem;
	}

	.scan-btn {
		flex: 1;
		padding: 1rem 1.25rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-lg);
		text-align: left;
		cursor: pointer;
		transition: border-color 0.2s, box-shadow 0.2s;
		font-family: inherit;
	}

	.scan-btn:hover:not(:disabled) {
		border-color: var(--color-accent-muted);
		box-shadow: var(--shadow-glow);
	}

	.scan-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.scan-btn strong {
		display: block;
		font-size: 0.875rem;
		color: var(--color-text);
		margin-bottom: 0.25rem;
		font-weight: 500;
	}

	.scan-btn span {
		font-size: 0.8125rem;
		color: var(--color-text-faint);
	}

	/* Jobs */
	.empty-text {
		color: var(--color-text-faint);
		font-size: 0.875rem;
	}

	.job-list {
		background: var(--color-surface);
		border-radius: var(--radius-lg);
		overflow: hidden;
		border: 1px solid var(--color-border-subtle);
	}

	.job-row {
		padding: 0.625rem 1.25rem;
		border-bottom: 1px solid var(--color-border-subtle);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.job-row:last-child { border-bottom: none; }

	.job-info {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.job-type {
		font-size: 0.875rem;
		font-weight: 500;
	}

	.job-time {
		font-size: 0.75rem;
		color: var(--color-text-faint);
	}

	.job-status-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.job-status {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.125rem 0.5rem;
		border-radius: 3px;
	}

	.job-status.running {
		color: var(--color-accent);
		background: rgba(212, 168, 67, 0.1);
	}

	.job-status.completed {
		color: var(--color-synced);
		background: rgba(76, 175, 106, 0.1);
	}

	.job-status.failed {
		color: var(--color-danger);
		background: rgba(212, 80, 80, 0.1);
	}

	.job-progress {
		font-size: 0.75rem;
		color: var(--color-text-faint);
	}

	.job-error {
		width: 100%;
		font-size: 0.75rem;
		color: var(--color-danger);
	}

	/* Players */
	.btn-primary {
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

	.btn-primary:hover {
		background: var(--color-accent-hover);
	}

	.loading-state {
		text-align: center;
		padding: 3rem 0;
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

	.empty-state {
		text-align: center;
		padding: 3rem 0;
		color: var(--color-text-muted);
	}

	.empty-state p {
		margin: 0 0 0.5rem;
	}

	.empty-state.small {
		padding: 1.5rem 0;
	}

	.hint {
		color: var(--color-text-faint);
		font-size: 0.875rem;
	}

	.player-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.player-card {
		background: var(--color-surface);
		border-radius: var(--radius-lg);
		padding: 1rem 1.25rem;
		border: 1px solid var(--color-border-subtle);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		transition: border-color 0.2s;
	}

	.player-card:hover {
		border-color: var(--color-border);
	}

	.player-card.active {
		border-color: var(--color-accent-muted);
		background: var(--color-accent-soft);
	}

	.player-card.disconnected {
		opacity: 0.6;
		border-color: var(--color-border-subtle);
		border-style: dashed;
	}

	.player-info {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		flex: 1;
		min-width: 0;
	}

	.player-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.player-name {
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--color-text);
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.active-badge {
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.0625rem 0.375rem;
		background: var(--color-accent);
		color: #1a1815;
		border-radius: 3px;
	}

	.disconnected-badge {
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.0625rem 0.375rem;
		background: var(--color-error, #e55);
		color: #fff;
		border-radius: 3px;
	}

	.player-paths {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		font-size: 0.75rem;
	}

	.path-value {
		background: var(--color-bg);
		padding: 0.125rem 0.375rem;
		border-radius: 3px;
		color: var(--color-text-muted);
	}

	.path-separator {
		color: var(--color-text-faint);
	}


	.player-stats {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}

	.stat strong {
		color: var(--color-text);
	}

	.stat-separator {
		color: var(--color-text-faint);
	}

	.player-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.btn-action-small {
		padding: 0.3125rem 0.625rem;
		border-radius: 5px;
		border: none;
		background: var(--color-accent);
		color: #1a1815;
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		font-family: inherit;
	}

	.btn-ghost-small {
		padding: 0.3125rem 0.625rem;
		border-radius: 5px;
		border: 1px solid var(--color-border);
		background: transparent;
		color: var(--color-text-muted);
		font-size: 0.75rem;
		cursor: pointer;
		font-family: inherit;
	}

	.btn-ghost-small:hover {
		border-color: var(--color-text-faint);
		color: var(--color-text);
	}

	.btn-danger-small {
		padding: 0.3125rem 0.625rem;
		border-radius: 5px;
		border: 1px solid var(--color-border);
		background: transparent;
		color: var(--color-danger);
		font-size: 0.75rem;
		cursor: pointer;
		font-family: inherit;
	}

	.btn-danger-small:hover {
		background: rgba(212, 80, 80, 0.1);
		border-color: var(--color-danger);
	}

	/* Modal */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.65);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 9999;
		padding: 1rem;
		backdrop-filter: blur(4px);
	}

	.modal {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-xl);
		padding: 1.75rem;
		max-width: 480px;
		width: 100%;
		max-height: 80vh;
		overflow-y: auto;
		box-shadow: var(--shadow-lg);
	}

	.modal-title {
		font-family: var(--font-display);
		font-size: 1.125rem;
		font-weight: 400;
		color: var(--color-text);
		margin: 0 0 1rem;
	}

	.modal-title.danger {
		color: var(--color-danger);
	}

	.modal-steps {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
	}

	.step {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--color-bg);
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-weight: 600;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.step.active {
		background: var(--color-accent);
		color: #1a1815;
	}

	.step-divider {
		width: 24px;
		height: 1px;
		background: var(--color-border);
	}

	.modal-body {
		margin-bottom: 1.5rem;
	}

	.modal-description {
		font-size: 0.875rem;
		color: var(--color-text-muted);
		margin: 0 0 1rem;
		line-height: 1.5;
	}

	.form-group {
		margin-bottom: 1rem;
	}

	.form-group label {
		display: block;
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin-bottom: 0.375rem;
	}

	.form-group input {
		width: 100%;
		padding: 0.5rem 0.75rem;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		color: var(--color-text);
		font-size: 0.875rem;
		font-family: inherit;
		outline: none;
		box-sizing: border-box;
	}

	.form-group input:focus {
		border-color: var(--color-accent-muted);
	}

	.form-hint {
		font-size: 0.75rem;
		color: var(--color-text-faint);
		margin: 0.375rem 0 0;
	}

	.modal-actions {
		display: flex;
		gap: 0.625rem;
		justify-content: flex-end;
	}

	.btn-cancel {
		padding: 0.4375rem 1rem;
		border-radius: 6px;
		border: 1px solid var(--color-border);
		background: transparent;
		color: var(--color-text-muted);
		font-size: 0.8125rem;
		cursor: pointer;
		font-family: inherit;
	}

	.btn-cancel:hover:not(:disabled) {
		border-color: var(--color-text-faint);
		color: var(--color-text);
	}

	.btn-confirm {
		padding: 0.4375rem 1rem;
		border-radius: 6px;
		border: none;
		background: var(--color-accent);
		color: #1a1815;
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
		font-family: inherit;
		transition: background 0.15s;
	}

	.btn-confirm:hover:not(:disabled) {
		background: var(--color-accent-hover);
	}

	.btn-confirm:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.btn-confirm-delete {
		padding: 0.4375rem 1rem;
		border-radius: 6px;
		border: none;
		background: var(--color-danger);
		color: white;
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
		font-family: inherit;
		transition: background 0.15s;
	}

	.btn-confirm-delete:hover {
		background: var(--color-danger-hover);
	}

	/* Device list */
	.device-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.device-option {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.125rem;
		padding: 0.75rem;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s;
		font-family: inherit;
		text-align: left;
		width: 100%;
	}

	.device-option:hover {
		border-color: var(--color-accent-muted);
		background: var(--color-surface-raised);
	}

	.device-name {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text);
	}

	.device-path {
		font-size: 0.75rem;
		color: var(--color-text-faint);
		font-family: monospace;
	}

	.device-size {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		background: var(--color-surface);
		padding: 0.0625rem 0.375rem;
		border-radius: 3px;
	}

	/* Directory browser */
	.directory-browser {
		background: var(--color-bg);
		border-radius: 6px;
		padding: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.current-path {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
		font-size: 0.8125rem;
	}

	.path-label {
		color: var(--color-text-muted);
	}

	.loading-dirs {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem 0;
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}

	.no-dirs {
		font-size: 0.8125rem;
		color: var(--color-text-faint);
		text-align: center;
		padding: 1rem 0;
		margin: 0;
	}

	.directory-list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		max-height: 200px;
		overflow-y: auto;
	}

	.directory-option {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.625rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.1s;
		font-family: inherit;
		text-align: left;
		width: 100%;
	}

	.directory-option:hover {
		border-color: var(--color-accent-muted);
		background: var(--color-surface-raised);
	}

	.dir-icon {
		font-size: 0.875rem;
	}

	.dir-name {
		font-size: 0.8125rem;
		color: var(--color-text);
		flex: 1;
	}

	.dir-path {
		font-size: 0.6875rem;
		color: var(--color-text-faint);
		font-family: monospace;
	}

	.btn-up {
		font-size: 0.75rem;
		padding: 0.125rem 0.5rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: 4px;
		color: var(--color-text-muted);
		cursor: pointer;
		font-family: inherit;
	}

	.btn-up:hover {
		border-color: var(--color-accent-muted);
		color: var(--color-text);
	}

	.create-dir-row {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.create-dir-row input {
		flex: 1;
		padding: 0.375rem 0.5rem;
		font-size: 0.8125rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: 4px;
		color: var(--color-text);
		font-family: inherit;
	}

	.create-dir-row input:focus {
		outline: none;
		border-color: var(--color-accent-muted);
	}

	.btn-create-dir {
		padding: 0.375rem 0.75rem;
		font-size: 0.8125rem;
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border-subtle);
		border-radius: 4px;
		color: var(--color-text);
		cursor: pointer;
		font-family: inherit;
		white-space: nowrap;
	}

	.btn-create-dir:hover:not(:disabled) {
		border-color: var(--color-accent-muted);
	}

	.btn-create-dir:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.selected-path {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		padding: 0.5rem 0.75rem;
		background: rgba(76, 175, 106, 0.1);
		border-radius: 4px;
	}

	.summary {
		background: var(--color-bg);
		border-radius: 6px;
		padding: 0.75rem;
		margin-top: 1rem;
	}

	.summary-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.375rem;
		font-size: 0.8125rem;
	}

	.summary-row:last-child {
		margin-bottom: 0;
	}

	.summary-label {
		color: var(--color-text-muted);
		min-width: 70px;
	}

	@media (max-width: 640px) {
		.scan-actions { flex-direction: column; }

		.player-card {
			flex-direction: column;
			align-items: flex-start;
		}

		.player-actions {
			width: 100%;
			justify-content: flex-end;
		}
	}
</style>