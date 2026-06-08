import { Injectable, inject, signal } from "@angular/core";
import { ApiService } from "../core/services/api.service";
import { QaHost, runQaHarness } from "./chat-qa-harness";

/**
 * Shared automated chat-QA runner. Holds the run state (so any component's button can
 * bind to it) and drives the live chatbot through the harness via a QaHost adapter the
 * caller supplies. On finish it POSTs the transcript+report to the backend, which
 * writes it to <repo-root>/logs/<name>.log. Console-mirrors the log too.
 *
 * providedIn root → one shared instance; a single run at a time across the app.
 */
@Injectable({ providedIn: "root" })
export class ChatQaService {
  private readonly api = inject(ApiService);

  readonly running = signal(false);
  readonly status = signal("");
  /** Per-session run counter — the XX suffix in the log filename. */
  private runSeq = 0;

  /** Begin a QA run. No-op if one is already running. */
  start(host: QaHost, opts: { count?: number; customerMode?: boolean } = {}): void {
    if (this.running()) return;
    void this.run(host, opts.count ?? 100, opts.customerMode === true);
  }

  /** Cancel the in-flight run; the harness checks this between scenarios. */
  cancel(): void {
    this.running.set(false);
  }

  private async run(host: QaHost, count: number, customerMode: boolean): Promise<void> {
    this.running.set(true);
    const name = this.makeLogName();
    let log: string[] = [];
    try {
      log = await runQaHarness(host, {
        count,
        logName: name,
        customerMode,
        onProgress: (done, total) => this.status.set(`QA ${done}/${total}`),
        cancelled: () => !this.running(),
      });
    } finally {
      this.status.set("Saving log…");
      this.save(name, log);
      this.running.set(false);
    }
  }

  /** POST the assembled log to the backend for writing under logs/. */
  private save(name: string, lines: string[]): void {
    const content = lines.join("\n");
    console.log(content);
    if (!content.trim()) return;
    this.api.post<{ ok: boolean; file: string }>("/chat/qa-log", { name, content }).subscribe({
      next: (r) => this.status.set(`Saved ${r.file}`),
      error: () => this.status.set("Log save failed — see console for transcript"),
    });
  }

  /**
   * ChatQA_Log_HHMMDDMMYYXX — hour, minute, day, month, 2-digit year, 2-digit run seq.
   * e.g. 04:18 on 08/06/26, run 01 → ChatQA_Log_041808062601.
   */
  private makeLogName(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    this.runSeq += 1;
    return (
      "ChatQA_Log_" +
      p(d.getHours()) +
      p(d.getMinutes()) +
      p(d.getDate()) +
      p(d.getMonth() + 1) +
      p(d.getFullYear() % 100) +
      p(this.runSeq)
    );
  }
}
