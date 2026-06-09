import { Injectable, inject, signal } from "@angular/core";
import { firstValueFrom } from "rxjs";
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
    const requested = this.makeLogName();
    let resolvedName = requested;

    // Collect every log line in memory during the run — the most reliable record.
    // Console-mirrored in real time; written to disk once at the end.
    const lines: string[] = [];

    const writeLine = (line: string): void => {
      if (line.trim()) console.log(line.trimEnd());
      lines.push(line);
    };

    try {
      await runQaHarness(host, {
        count,
        logName: requested,
        customerMode,
        onProgress: (done, total) => this.status.set(`QA ${done}/${total}`),
        cancelled: () => !this.running(),
        onChunk: async (text) => {
          // Console-mirror each non-empty line in real time.
          for (const line of text.split("\n")) {
            const t = line.trimEnd();
            if (t) console.log(t);
          }
          // Accumulate the raw chunk text for the final disk write.
          lines.push(text);
        },
      });
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      writeLine(`\n---\n## RUN ERROR\nThe run stopped unexpectedly: ${msg}\n`);
      this.status.set("Run errored — partial log saved");
    } finally {
      // Write the entire log to the server in ONE call. No incremental chunks,
      // no file-lock retries mid-run. If this fails, the console still has it.
      try {
        const r = await firstValueFrom(
          this.api.post<{ ok: boolean; name: string; file: string }>("/chat/qa-log", {
            name: requested,
            content: lines.join("\n"),
            append: false,
          }),
        );
        resolvedName = r?.name || requested;
        this.status.set(`Saved logs/${resolvedName}.log (${lines.length} lines)`);
      } catch {
        this.status.set(`Write failed — log is in browser console (${lines.length} lines)`);
      }
      this.running.set(false);
    }
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
