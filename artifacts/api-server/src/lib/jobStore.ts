export type JobStatus = "pending" | "running" | "done" | "failed";

export interface Job {
  id: string;
  userId: string | null;
  status: JobStatus;
  progress: number;
  total: number;
  result?: unknown;
  error?: string;
  createdAt: number;
}

const jobs = new Map<string, Job>();

export function createJob(id: string, total = 100, userId: string | null = null): Job {
  const job: Job = {
    id,
    userId,
    status: "pending",
    progress: 0,
    total,
    createdAt: Date.now(),
  };
  jobs.set(id, job);
  return job;
}

export function updateJob(id: string, patch: Partial<Job>): void {
  const job = jobs.get(id);
  if (job) Object.assign(job, patch);
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of jobs.entries()) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}, 5 * 60 * 1000);
