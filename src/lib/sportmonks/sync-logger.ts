/**
 * Structured logging for cron sync: mirrors to server console and optionally returns in HTTP JSON (verbose=1).
 * Never log secrets (API tokens, service keys).
 */
export class SyncLogger {
  private readonly lines: string[] = [];
  private readonly maxLines: number;

  constructor(maxLines = 2500) {
    this.maxLines = maxLines;
  }

  entry(message: string, meta?: Record<string, unknown>) {
    const ts = new Date().toISOString();
    const suffix =
      meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
    const line = `${ts} ${message}${suffix}`;
    if (this.lines.length < this.maxLines) {
      this.lines.push(line);
    }
    console.log(`[sportmonks-sync] ${line}`);
  }

  getLines(): string[] {
    return [...this.lines];
  }
}
