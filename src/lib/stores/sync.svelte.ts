export interface SyncJob {
	id: number;
	type: 'copy' | 'remove';
	status: 'running' | 'completed' | 'failed';
	progress: number;
	total: number;
	result?: string;
	error?: string;
	label?: string;
}

let activeJobs = $state<SyncJob[]>([]);
let pollingTimers = new Map<number, ReturnType<typeof setInterval>>();

export function getActiveJobs(): SyncJob[] {
	return activeJobs;
}

export function trackJob(jobId: number, type: 'copy' | 'remove', label?: string) {
	activeJobs = [...activeJobs, {
		id: jobId,
		type,
		status: 'running',
		progress: 0,
		total: 0,
		label
	}];

	const timer = setInterval(() => pollJob(jobId), 800);
	pollingTimers.set(jobId, timer);

	// Also poll immediately
	pollJob(jobId);
}

async function pollJob(jobId: number) {
	try {
		const res = await fetch(`/api/jobs/${jobId}`);
		if (!res.ok) return;

		const { job } = await res.json();
		activeJobs = activeJobs.map(j =>
			j.id === jobId
				? { ...j, status: job.status, progress: job.progress, total: job.total, result: job.result, error: job.error }
				: j
		);

		if (job.status !== 'running') {
			const timer = pollingTimers.get(jobId);
			if (timer) {
				clearInterval(timer);
				pollingTimers.delete(jobId);
			}

			// Notify listeners
			const callbacks = completionCallbacks.get(jobId);
			if (callbacks) {
				callbacks.forEach(cb => cb(job));
				completionCallbacks.delete(jobId);
			}

			// Remove from active list after a delay so user sees the result
			setTimeout(() => {
				activeJobs = activeJobs.filter(j => j.id !== jobId);
			}, 3000);
		}
	} catch {
		// Network error, will retry on next poll
	}
}

type CompletionCallback = (job: SyncJob) => void;
const completionCallbacks = new Map<number, CompletionCallback[]>();

export function onJobComplete(jobId: number, callback: CompletionCallback) {
	const existing = completionCallbacks.get(jobId) || [];
	completionCallbacks.set(jobId, [...existing, callback]);
}

/** Recover running jobs on page load */
export async function recoverRunningJobs() {
	try {
		const res = await fetch('/api/jobs?status=running');
		if (!res.ok) return;

		const { jobs } = await res.json();
		for (const job of jobs) {
			if (!activeJobs.some(j => j.id === job.id)) {
				trackJob(job.id, job.type === 'sync' ? 'copy' : 'remove');
			}
		}
	} catch {
		// Ignore
	}
}
