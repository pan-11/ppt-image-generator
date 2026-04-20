type TaskOutcome = "completed" | "failed";

type QueueSchedulerOptions = {
  maxConcurrency: number;
  runTask: (taskId: string) => Promise<{ outcome: TaskOutcome }>;
};

export class QueueScheduler {
  private readonly queue: string[] = [];
  private readonly running = new Set<string>();
  private completed = 0;
  private failed = 0;
  private paused = false;
  private idleResolvers: Array<() => void> = [];

  constructor(private readonly options: QueueSchedulerOptions) {}

  enqueue(taskId: string) {
    this.queue.push(taskId);
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
      running: this.running.size,
      completed: this.completed,
      failed: this.failed,
      paused: this.paused
    };
  }

  async onIdle() {
    if (this.queue.length === 0 && this.running.size === 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.idleResolvers.push(resolve);
    });
  }

  private fillSlots() {
    if (this.paused) {
      return;
    }

    while (this.running.size < this.options.maxConcurrency && this.queue.length > 0) {
      const taskId = this.queue.shift();

      if (!taskId) {
        return;
      }

      this.running.add(taskId);

      void this.options.runTask(taskId)
        .then(({ outcome }) => {
          if (outcome === "completed") {
            this.completed += 1;
          } else {
            this.failed += 1;
          }
        })
        .catch(() => {
          this.failed += 1;
        })
        .finally(() => {
          this.running.delete(taskId);
          this.fillSlots();

          if (this.queue.length === 0 && this.running.size === 0) {
            this.idleResolvers.splice(0).forEach((resolve) => resolve());
          }
        });
    }
  }
}
