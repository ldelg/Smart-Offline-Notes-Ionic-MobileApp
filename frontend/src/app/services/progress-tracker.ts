export type ProgressPhase = 'download' | 'load' | 'transcribe';

export interface ProgressView {
  phase: ProgressPhase;
  /** Null means the bar should be indeterminate. */
  percent: number | null;
}

export interface ModelProgressEvent {
  status?: string;
  file?: string;
  name?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}

const MIN_INTERVAL_MS = 100;

interface FileBytes {
  loaded: number;
  total: number;
}

/**
 * Turns per-file model events into one phase and one percentage.
 * The percentage never moves backwards, and UI updates are limited to
 * about ten per second.
 */
export class ProgressTracker {
  private files = new Map<string, FileBytes>();
  private phase: ProgressPhase = 'load';
  private highWater = 0;
  private lastEmitAt = Number.NEGATIVE_INFINITY;
  private pending = false;
  private emitted: ProgressView | null = null;

  reset(): void {
    this.files.clear();
    this.phase = 'load';
    this.highWater = 0;
    this.lastEmitAt = Number.NEGATIVE_INFINITY;
    this.pending = false;
    this.emitted = null;
  }

  get hasPending(): boolean {
    return this.pending;
  }

  push(event: ModelProgressEvent, now: number): ProgressView | null {
    this.ingest(event);
    return this.emitIfDue(now, false);
  }

  flush(now: number): ProgressView | null {
    this.pending = false;
    return this.emitIfDue(now, true);
  }

  private ingest(event: ModelProgressEvent): void {
    if (this.phase === 'transcribe') return;

    const status = event.status;
    if (status === 'ready' || status === 'transcribe') {
      this.phase = 'transcribe';
      return;
    }

    const file = event.file;
    if (file) {
      this.noteFile(file, event);
      this.phase = 'download';
      return;
    }

    if (this.phase !== 'download') {
      this.phase = 'load';
    }
  }

  private noteFile(file: string, event: ModelProgressEvent): void {
    const previous = this.files.get(file) ?? { loaded: 0, total: 0 };
    let total = typeof event.total === 'number' && event.total > 0 ? event.total : previous.total;
    let loaded = typeof event.loaded === 'number' && event.loaded >= 0 ? event.loaded : previous.loaded;

    if (typeof event.progress === 'number' && Number.isFinite(event.progress)) {
      const fraction = Math.min(100, Math.max(0, event.progress)) / 100;
      if (total > 0) {
        loaded = Math.max(loaded, fraction * total);
      } else {
        total = 100;
        loaded = Math.max(loaded, fraction * 100);
      }
    }

    if (event.status === 'done') {
      if (total <= 0) total = 100;
      loaded = total;
    }

    this.files.set(file, {
      loaded: Math.max(previous.loaded, loaded),
      total: Math.max(previous.total, total),
    });
  }

  private downloadPercent(): number | null {
    let loaded = 0;
    let total = 0;
    for (const file of this.files.values()) {
      if (file.total <= 0) continue;
      loaded += Math.min(file.loaded, file.total);
      total += file.total;
    }
    if (total <= 0) return null;
    const computed = (loaded / total) * 100;
    this.highWater = Math.max(this.highWater, computed);
    return Math.round(Math.min(100, this.highWater));
  }

  private view(): ProgressView {
    return {
      phase: this.phase,
      percent: this.phase === 'download' ? this.downloadPercent() : null,
    };
  }

  private emitIfDue(now: number, force: boolean): ProgressView | null {
    const view = this.view();
    if (
      this.emitted &&
      this.emitted.phase === view.phase &&
      this.emitted.percent === view.percent
    ) {
      this.pending = false;
      return null;
    }
    if (!force && now - this.lastEmitAt < MIN_INTERVAL_MS) {
      this.pending = true;
      return null;
    }
    this.pending = false;
    this.lastEmitAt = now;
    this.emitted = view;
    return view;
  }
}
