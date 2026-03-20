<script lang="ts">
	import { getActiveJobs, type SyncJob } from '$lib/stores/sync.svelte.js';

	let jobs = $derived(getActiveJobs());
	let hasJobs = $derived(jobs.length > 0);

	function progressPct(job: SyncJob): number {
		if (job.total === 0) return 0;
		return Math.round((job.progress / job.total) * 100);
	}

	function statusLabel(job: SyncJob): string {
		if (job.status === 'completed') return 'Done';
		if (job.status === 'failed') return 'Failed';
		return `${job.progress}/${job.total}`;
	}
</script>

{#if hasJobs}
	<div class="sync-progress">
		{#each jobs as job (job.id)}
			<div class="job" class:done={job.status === 'completed'} class:failed={job.status === 'failed'}>
				<div class="job-header">
					<span class="job-type">{job.type === 'copy' ? 'Syncing' : 'Removing'}</span>
					<span class="job-status">{statusLabel(job)}</span>
				</div>
				{#if job.label}
					<span class="job-label">{job.label}</span>
				{/if}
				<div class="progress-bar">
					<div
						class="progress-fill"
						class:done={job.status === 'completed'}
						class:failed={job.status === 'failed'}
						style="width: {progressPct(job)}%"
					></div>
				</div>
			</div>
		{/each}
	</div>
{/if}

<style>
	.sync-progress {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem 1.25rem;
		border-top: 1px solid var(--color-border-subtle);
	}

	.job {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.job-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.job-type {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-accent);
	}

	.job.done .job-type {
		color: var(--color-success, #4a9);
	}

	.job.failed .job-type {
		color: var(--color-danger);
	}

	.job-status {
		font-size: 0.625rem;
		color: var(--color-text-faint);
		font-variant-numeric: tabular-nums;
	}

	.job-label {
		font-size: 0.6875rem;
		color: var(--color-text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.progress-bar {
		height: 3px;
		background: var(--color-border);
		border-radius: 2px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--color-accent);
		border-radius: 2px;
		transition: width 0.3s ease;
	}

	.progress-fill.done {
		background: var(--color-success, #4a9);
	}

	.progress-fill.failed {
		background: var(--color-danger);
	}
</style>
