import { watch, type FSWatcher } from "node:fs";
import path from "node:path";

type WatchFactory = (folder: string, options: { persistent: false }, listener: () => void) => FSWatcher;

export interface RuntimeWatchServiceOptions {
  onRefresh: () => Promise<void> | void;
  trace?: (message: string) => void;
  debounceMilliseconds?: number;
  watchFactory?: WatchFactory;
}

export class RuntimeWatchService {
  private readonly onRefresh: () => Promise<void> | void;
  private readonly trace: (message: string) => void;
  private readonly debounceMilliseconds: number;
  private readonly watchFactory: WatchFactory;
  private watchedInstance: string | null = null;
  private watchers: FSWatcher[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(options: RuntimeWatchServiceOptions) {
    this.onRefresh = options.onRefresh;
    this.trace = options.trace ?? (() => undefined);
    this.debounceMilliseconds = options.debounceMilliseconds ?? 180;
    this.watchFactory = options.watchFactory ?? watch;
  }

  start(instancePath: string) {
    const normalized = path.resolve(instancePath).toLocaleLowerCase("en-US");
    if (this.watchedInstance === normalized && this.watchers.length > 0) return;
    this.stop();
    this.watchedInstance = normalized;
    const outputRoot = path.join(instancePath, "colonybridge");
    for (const folder of [outputRoot, path.join(outputRoot, "latest")]) {
      try {
        const watcher = this.watchFactory(folder, { persistent: false }, () => this.scheduleRefresh());
        watcher.on("error", (error) => this.trace(`Bridge watch unavailable: ${error.message}`));
        this.watchers.push(watcher);
      } catch (error) {
        this.trace(`Bridge watch could not start: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  restart(instancePath: string) {
    this.stop();
    this.start(instancePath);
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const watcher of this.watchers) {
      try { watcher.close(); } catch { /* an already-failed watcher is still considered stopped */ }
    }
    this.watchers = [];
    this.watchedInstance = null;
  }

  private scheduleRefresh() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      Promise.resolve(this.onRefresh()).catch((error) => {
        this.trace(`watched refresh failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, this.debounceMilliseconds);
    this.timer.unref();
  }
}
