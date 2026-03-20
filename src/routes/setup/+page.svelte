<script lang="ts">
	import { goto } from '$app/navigation';

	interface DiscoveredDevice {
		name: string;
		path: string;
	}

	let step = $state(1);
	let discoveredDevices = $state<DiscoveredDevice[]>([]);
	let selectedDevice = $state<DiscoveredDevice | null>(null);
	let directories = $state<{ name: string; path: string }[]>([]);
	let managedDirInput = $state('');
	let playerNameInput = $state('');
	let loading = $state(false);
	let initProgress = $state('');
	let error = $state('');
	let mountBase = $state('');

	async function discoverDevices() {
		loading = true;
		try {
			const res = await fetch('/api/setup/browse', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});
			const data = await res.json();
			discoveredDevices = data.directories || [];
			mountBase = data.mountBase || '';
			error = '';
		} catch {
			error = 'Failed to discover devices';
		} finally {
			loading = false;
		}
	}

	async function selectDevice(device: DiscoveredDevice) {
		selectedDevice = device;
		playerNameInput = device.name;
		managedDirInput = '';
		directories = [];
		loading = true;
		step = 3;

		try {
			const res = await fetch('/api/players/browse', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path: device.path })
			});
			const data = await res.json();
			directories = data.directories || [];
		} catch {
			error = 'Failed to browse device';
		} finally {
			loading = false;
		}
	}

	async function browseDirectory(absolutePath: string, relativePath: string) {
		loading = true;
		try {
			const res = await fetch('/api/players/browse', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path: absolutePath })
			});
			const data = await res.json();
			directories = data.directories || [];
			managedDirInput = relativePath;
		} catch {
			error = 'Failed to browse directory';
		} finally {
			loading = false;
		}
	}

	async function initializePlayer() {
		if (!selectedDevice) {
			error = 'No device selected';
			return;
		}

		step = 4;
		initProgress = 'Analyzing existing files...';
		loading = true;

		try {
			const res = await fetch('/api/setup/init', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: playerNameInput || selectedDevice.name,
					mountPath: selectedDevice.path,
					managedDir: managedDirInput
				})
			});
			const data = await res.json();

			if (data.success) {
				initProgress = 'Setup complete!';
				step = 5;
			} else {
				error = data.error || 'Setup failed';
				step = 3;
			}
		} catch {
			error = 'Connection error during setup';
			step = 3;
		} finally {
			loading = false;
		}
	}

	// Discover devices when entering step 2
	$effect(() => {
		if (step === 2) {
			discoverDevices();
		}
	});
</script>

<div class="setup-page">
	<div class="setup-container">
		<div class="setup-header">
			<span class="setup-icon">◆</span>
			<h1>Crate</h1>
			<p class="setup-subtitle">First-time setup</p>
		</div>

		<!-- Step indicator -->
		<div class="steps">
			<div class="step" class:active={step >= 1} class:done={step > 1}>
				<span class="step-num">{step > 1 ? '✓' : '1'}</span>
				<span class="step-label">Welcome</span>
			</div>
			<div class="step-line" class:active={step > 1}></div>
			<div class="step" class:active={step >= 2} class:done={step > 2}>
				<span class="step-num">{step > 2 ? '✓' : '2'}</span>
				<span class="step-label">Select device</span>
			</div>
			<div class="step-line" class:active={step > 2}></div>
			<div class="step" class:active={step >= 3} class:done={step > 3}>
				<span class="step-num">{step > 3 ? '✓' : '3'}</span>
				<span class="step-label">Choose directory</span>
			</div>
			<div class="step-line" class:active={step > 3}></div>
			<div class="step" class:active={step >= 4} class:done={step > 4}>
				<span class="step-num">{step > 4 ? '✓' : '4'}</span>
				<span class="step-label">Initialize</span>
			</div>
		</div>

		<!-- Step 1: Welcome -->
		{#if step === 1}
			<div class="step-content">
				<h2>Welcome</h2>
				<p>
					This application manages music on your portable audio player.
					It syncs tracks from your music library to the player, keeping
					the folder structure consistent.
				</p>
				<div class="info-box">
					<strong>What happens next:</strong>
					<ol>
						<li>Select your player device</li>
						<li>Pick a directory on the player to manage</li>
						<li>Existing files will be reorganized to match your library structure</li>
						<li>Your music library and player will be scanned</li>
					</ol>
				</div>
				<button class="btn btn-primary" onclick={() => step = 2}>
					Get started
				</button>
			</div>
		{/if}

		<!-- Step 2: Device picker -->
		{#if step === 2}
			<div class="step-content">
				<h2>Select your player</h2>
				<p>Choose the mounted device that contains your audio player.</p>

				{#if error}
					<div class="error-box">{error}</div>
				{/if}

				{#if loading}
					<div class="progress-section">
						<div class="spinner"></div>
						<p>Discovering devices...</p>
					</div>
				{:else if discoveredDevices.length === 0}
					<div class="info-box">
						<strong>No devices found</strong>
						<p>Make sure your player is mounted at <code>{mountBase}</code>.</p>
						<p>You can set the <code>PLAYER_MOUNT_BASE</code> or <code>PLAYER_BASE_PATH</code> environment variable to change the mount base path.</p>
					</div>
				{:else}
					<div class="existing-dirs">
						<span class="existing-dirs-label">Discovered devices at <code>{mountBase}</code>:</span>
						<div class="dir-list">
							{#each discoveredDevices as device}
								<button
									class="dir-item"
									onclick={() => selectDevice(device)}
								>
									<span class="dir-icon">📁</span>
									<span class="dir-item-name">{device.name}</span>
									<span class="dir-item-path">{device.path}</span>
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<div class="step-actions">
					<button class="btn btn-ghost" onclick={() => step = 1}>Back</button>
				</div>
			</div>
		{/if}

		<!-- Step 3: Directory picker -->
		{#if step === 3}
			<div class="step-content">
				<h2>Choose managed directory</h2>
				<p>Select the directory on <strong>{selectedDevice?.name}</strong> where music will be stored, or use the root.</p>

				{#if error}
					<div class="error-box">{error}</div>
				{/if}

				{#if loading}
					<div class="progress-section">
						<div class="spinner"></div>
						<p>Loading directories...</p>
					</div>
				{:else if directories.length > 0}
					<div class="existing-dirs">
						<span class="existing-dirs-label">Directories:</span>
						<div class="dir-list">
							{#each directories as dir}
								{@const relativePath = selectedDevice ? dir.path.slice(selectedDevice.path.length).replace(/^\//, '') : dir.name}
								<button
									class="dir-item"
									class:selected={managedDirInput === relativePath}
									onclick={() => browseDirectory(dir.path, relativePath)}
								>
									<span class="dir-icon">📁</span>
									<span class="dir-item-name">{dir.name}</span>
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<div class="selected-dir-info">
					<span class="existing-dirs-label">Selected directory:</span>
					<code>{managedDirInput || '/ (root of device)'}</code>
				</div>

				<!-- Player name -->
				<div class="path-input">
					<span class="path-prefix">Name:</span>
					<input
						type="text"
						class="path-editable"
						bind:value={playerNameInput}
						placeholder={selectedDevice?.name || 'My Player'}
					/>
				</div>

				<div class="step-actions">
					<button class="btn btn-ghost" onclick={() => step = 2}>Back</button>
					<button
						class="btn btn-primary"
						onclick={initializePlayer}
					>
						Initialize
					</button>
				</div>
			</div>
		{/if}

		<!-- Step 4: Initializing -->
		{#if step === 4}
			<div class="step-content">
				<h2>Initializing</h2>
				<div class="progress-section">
					<div class="spinner"></div>
					<p>{initProgress}</p>
					<p class="text-muted">
						This may take a while depending on how many files exist on the player
						and in your music library.
					</p>
				</div>
			</div>
		{/if}

		<!-- Step 5: Done -->
		{#if step === 5}
			<div class="step-content">
				<h2>All set</h2>
				<p>
					Your player is configured and ready. The music library and player
					have been scanned.
				</p>
				<button class="btn btn-primary" onclick={() => goto('/')}>
					Open Crate
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.setup-page {
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
	}

	.setup-container {
		width: 100%;
		max-width: 560px;
	}

	.setup-header {
		text-align: center;
		margin-bottom: 2.5rem;
	}

	.setup-icon {
		font-size: 1.5rem;
		color: var(--color-accent);
		display: block;
		margin-bottom: 0.75rem;
	}

	.setup-header h1 {
		font-family: var(--font-display);
		font-size: 1.75rem;
		font-weight: 400;
		margin: 0 0 0.375rem;
	}

	.setup-subtitle {
		color: var(--color-text-muted);
		font-size: 0.9375rem;
		margin: 0;
	}

	/* Steps indicator */
	.steps {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0;
		margin-bottom: 2.5rem;
	}

	.step {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		opacity: 0.35;
		transition: opacity 0.3s;
	}

	.step.active {
		opacity: 1;
	}

	.step-num {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.step.active .step-num {
		background: var(--color-accent);
		border-color: var(--color-accent);
		color: #1a1815;
	}

	.step.done .step-num {
		background: var(--color-synced);
		border-color: var(--color-synced);
		color: #1a1815;
	}

	.step-label {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		font-weight: 500;
	}

	.step.active .step-label {
		color: var(--color-text);
	}

	.step-line {
		width: 32px;
		height: 1px;
		background: var(--color-border);
		margin: 0 0.5rem;
		transition: background 0.3s;
	}

	.step-line.active {
		background: var(--color-accent);
	}

	/* Step content */
	.step-content {
		background: var(--color-surface);
		border: 1px solid var(--color-border-subtle);
		border-radius: 10px;
		padding: 2rem;
	}

	.step-content h2 {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 400;
		margin: 0 0 0.75rem;
	}

	.step-content p {
		color: var(--color-text-muted);
		font-size: 0.9375rem;
		line-height: 1.6;
		margin: 0 0 1.25rem;
	}

	/* Info box */
	.info-box {
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		padding: 1rem 1.25rem;
		margin-bottom: 1.5rem;
		font-size: 0.875rem;
	}

	.info-box strong {
		display: block;
		margin-bottom: 0.5rem;
		color: var(--color-text);
	}

	.info-box ol {
		margin: 0;
		padding-left: 1.25rem;
		color: var(--color-text-muted);
	}

	.info-box li {
		margin-bottom: 0.25rem;
		line-height: 1.5;
	}

	.info-box code {
		background: var(--color-bg);
		padding: 0.125rem 0.375rem;
		border-radius: 3px;
		font-size: 0.8125rem;
	}

	/* Error */
	.error-box {
		background: rgba(212, 80, 80, 0.1);
		border: 1px solid rgba(212, 80, 80, 0.3);
		color: var(--color-danger);
		border-radius: 6px;
		padding: 0.75rem 1rem;
		font-size: 0.875rem;
		margin-bottom: 1rem;
	}

	/* Path input */
	.path-input {
		display: flex;
		align-items: center;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		overflow: hidden;
		margin-bottom: 1.25rem;
	}

	.path-input:focus-within {
		border-color: var(--color-accent-muted);
	}

	.path-prefix {
		padding: 0.5rem 0 0.5rem 0.75rem;
		color: var(--color-text-faint);
		font-size: 0.9375rem;
		white-space: nowrap;
		user-select: none;
		flex-shrink: 0;
	}

	.path-editable {
		flex: 1;
		padding: 0.5rem 0.75rem 0.5rem 0;
		background: none;
		border: none;
		color: var(--color-text);
		font-size: 0.9375rem;
		outline: none;
		min-width: 0;
		font-family: inherit;
	}

	.path-editable::placeholder {
		color: var(--color-text-faint);
	}

	/* Existing directories */
	.existing-dirs {
		margin-bottom: 1.25rem;
	}

	.existing-dirs-label {
		display: block;
		font-size: 0.8125rem;
		color: var(--color-text-faint);
		margin-bottom: 0.5rem;
	}

	.dir-list {
		background: var(--color-bg);
		border: 1px solid var(--color-border-subtle);
		border-radius: 6px;
		overflow: hidden;
		max-height: 200px;
		overflow-y: auto;
	}

	.dir-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem 0.875rem;
		background: none;
		border: none;
		border-bottom: 1px solid var(--color-border-subtle);
		color: var(--color-text-muted);
		font-size: 0.875rem;
		cursor: pointer;
		text-align: left;
		font-family: inherit;
		transition: background 0.1s, color 0.1s;
	}

	.dir-item:last-child {
		border-bottom: none;
	}

	.dir-item:hover {
		background: var(--color-surface-raised);
		color: var(--color-text);
	}

	.dir-item.selected {
		background: rgba(212, 168, 67, 0.08);
		color: var(--color-accent);
	}

	.dir-icon {
		font-size: 0.8125rem;
		opacity: 0.6;
	}

	.dir-item-name {
		flex: 1;
	}

	.dir-item-path {
		font-size: 0.75rem;
		color: var(--color-text-faint);
		font-family: ui-monospace, monospace;
	}

	.selected-dir-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 1rem;
		padding: 0.5rem 0.75rem;
		background: rgba(76, 175, 106, 0.08);
		border-radius: 6px;
		font-size: 0.875rem;
	}

	.selected-dir-info code {
		color: var(--color-text);
	}

	/* Progress */
	.progress-section {
		text-align: center;
		padding: 1.5rem 0;
	}

	.spinner {
		width: 32px;
		height: 32px;
		border: 2px solid var(--color-border);
		border-top-color: var(--color-accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin: 0 auto 1rem;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.text-muted {
		color: var(--color-text-faint) !important;
		font-size: 0.8125rem !important;
	}

	/* Step actions */
	.step-actions {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
	}

	/* Buttons */
	.btn {
		padding: 0.5rem 1.25rem;
		border-radius: 6px;
		border: 1px solid transparent;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
		font-family: inherit;
	}

	.btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.btn-primary {
		background: var(--color-accent);
		color: #1a1815;
		border-color: var(--color-accent);
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--color-accent-hover);
	}

	.btn-ghost {
		background: transparent;
		color: var(--color-text-muted);
		border-color: var(--color-border);
	}

	.btn-ghost:hover {
		color: var(--color-text);
		border-color: var(--color-text-muted);
	}

	.btn-accent {
		background: rgba(212, 168, 67, 0.15);
		color: var(--color-accent);
		border-color: rgba(212, 168, 67, 0.3);
	}

	.btn-sm {
		padding: 0.25rem 0.625rem;
		font-size: 0.75rem;
	}
</style>
