/** Lightweight counters + heartbeat for future Pulse / Ops Center. */
class JobRuntimeMetrics {
  enqueuedTotal = 0;
  completedTotal = 0;
  failedTotal = 0;
  rejectedTotal = 0;
  pausedTenantSkips = 0;
  latencySumMs = 0;
  latencyCount = 0;
  byTenantRejected = new Map<string, number>();
  lastSuccessAt: string | null = null;
  lastFailureAt: string | null = null;
  lastFailureJob: string | null = null;
  workerStartedAt = new Date().toISOString();
  workerVersion = process.env['npm_package_version'] ?? '0.0.0';
  heartbeatAt: string | null = null;

  enqueued(_queue: string, _tenantId?: string): void {
    this.enqueuedTotal += 1;
  }

  completed(_queue: string, _tenantId: string | undefined, latencyMs: number): void {
    this.completedTotal += 1;
    this.latencySumMs += latencyMs;
    this.latencyCount += 1;
    this.lastSuccessAt = new Date().toISOString();
    this.heartbeat();
  }

  failed(_queue: string, _tenantId?: string, jobName?: string): void {
    this.failedTotal += 1;
    this.lastFailureAt = new Date().toISOString();
    this.lastFailureJob = jobName ?? null;
    this.heartbeat();
  }

  rejected(tenantId: string | undefined, code?: string): void {
    this.rejectedTotal += 1;
    if (code === 'TENANT_JOBS_BLOCKED') this.pausedTenantSkips += 1;
    if (tenantId) {
      this.byTenantRejected.set(tenantId, (this.byTenantRejected.get(tenantId) ?? 0) + 1);
    }
  }

  heartbeat(): void {
    this.heartbeatAt = new Date().toISOString();
  }

  snapshot() {
    return {
      enqueuedTotal: this.enqueuedTotal,
      completedTotal: this.completedTotal,
      failedTotal: this.failedTotal,
      rejectedTotal: this.rejectedTotal,
      pausedTenantSkips: this.pausedTenantSkips,
      avgLatencyMs:
        this.latencyCount === 0 ? 0 : Math.round(this.latencySumMs / this.latencyCount),
      rejectedByTenant: Object.fromEntries(this.byTenantRejected),
      lastSuccessAt: this.lastSuccessAt,
      lastFailureAt: this.lastFailureAt,
      lastFailureJob: this.lastFailureJob,
      workerStartedAt: this.workerStartedAt,
      workerVersion: this.workerVersion,
      heartbeatAt: this.heartbeatAt,
    };
  }
}

export const jobRuntimeMetrics = new JobRuntimeMetrics();
