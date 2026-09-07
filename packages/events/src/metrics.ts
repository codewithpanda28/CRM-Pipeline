export class OutboxMetrics {
  pending = 0;
  publishing = 0;
  dead = 0;
  published = 0;
  publishFailures = 0;
  retries = 0;
  leaseReclaims = 0;
  oldestPendingAgeSec: number | null = null;

  snapshot() {
    return {
      pending: this.pending,
      publishing: this.publishing,
      dead: this.dead,
      published: this.published,
      publishFailures: this.publishFailures,
      retries: this.retries,
      leaseReclaims: this.leaseReclaims,
      oldestPendingAgeSec: this.oldestPendingAgeSec,
    };
  }
}

export const outboxMetrics = new OutboxMetrics();
