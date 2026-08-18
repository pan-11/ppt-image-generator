type JobOutcome = "completed" | "failed";

export type ProviderLane = {
  providerId: string;
  maxConcurrency: number;
};

type ProviderJobSchedulerOptions = {
  resolveLane: (jobId: string) => ProviderLane;
  runJob: (
    jobId: string,
    lane: ProviderLane
  ) => Promise<{ outcome: JobOutcome }>;
};

export class ProviderJobScheduler {
  private readonly queue: string[] = [];
  private readonly runningJobs = new Map<string, string>();
  private readonly runningByProvider = new Map<string, number>();
  private completed = 0;
  private failed = 0;
  private paused = false;
  private idleResolvers: Array<() => void> = [];

  constructor(private readonly options: ProviderJobSchedulerOptions) {}

  enqueue(jobId: string) {
    this.queue.push(jobId);
    this.fillSlots();
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
    this.fillSlots();
  }

  stats() {
    return {
      queued: this.queue.length,
      running: this.runningJobs.size,
      completed: this.completed,
      failed: this.failed,
      paused: this.paused
    };
  }

  async onIdle() {
    if (this.queue.length === 0 && this.runningJobs.size === 0) return;
    await new Promise<void>((resolve) => {
      this.idleResolvers.push(resolve);
    });
  }

  private fillSlots() {
    if (this.paused) return;

    let started = true;
    while (started && this.queue.length > 0) {
      started = false;
      for (let index = 0; index < this.queue.length; index += 1) {
        const jobId = this.queue[index];
        if (!jobId) continue;
        const lane = this.options.resolveLane(jobId);
        if (!Number.isInteger(lane.maxConcurrency)
          || lane.maxConcurrency < 1
          || lane.maxConcurrency > 100) {
          throw new Error(`中转站最大并发无效：${lane.maxConcurrency}`);
        }
        const running = this.runningByProvider.get(lane.providerId) ?? 0;
        if (running >= lane.maxConcurrency) continue;

        this.queue.splice(index, 1);
        this.startJob(jobId, lane);
        started = true;
        break;
      }
    }
  }

  private startJob(jobId: string, lane: ProviderLane) {
    this.runningJobs.set(jobId, lane.providerId);
    this.runningByProvider.set(
      lane.providerId,
      (this.runningByProvider.get(lane.providerId) ?? 0) + 1
    );

    void this.options.runJob(jobId, lane)
      .then(({ outcome }) => {
        if (outcome === "completed") this.completed += 1;
        else this.failed += 1;
      })
      .catch(() => {
        this.failed += 1;
      })
      .finally(() => {
        this.runningJobs.delete(jobId);
        const remaining = (this.runningByProvider.get(lane.providerId) ?? 1) - 1;
        if (remaining > 0) this.runningByProvider.set(lane.providerId, remaining);
        else this.runningByProvider.delete(lane.providerId);
        this.fillSlots();
        if (this.queue.length === 0 && this.runningJobs.size === 0) {
          this.idleResolvers.splice(0).forEach((resolve) => resolve());
        }
      });
  }
}
