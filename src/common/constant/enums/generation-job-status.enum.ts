/** Backed by the native Postgres enum `generation_job_status`. */
export const GENERATION_JOB_STATUS = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type GenerationJobStatus =
  (typeof GENERATION_JOB_STATUS)[keyof typeof GENERATION_JOB_STATUS];
