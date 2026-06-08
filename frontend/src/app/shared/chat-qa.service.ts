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
    let created = false;

    // Incremental writer: the first chunk CREATES the file (and resolves the final
    // name on collision); every later chunk APPENDS. So the log is on disk as the run
    // progresses — a Stop or crash still leaves everything written so far recorded.
    const writeChunk = async (text: string): Promise<void> => {
      if (text.trim()) console.log(text.trimEnd());
      try {
        if (!created) {
          const r = await firstValueFrom(
            this.api.post<{ ok: boolean; name: string; file: string }>("/chat/qa-log", {
              name: requested,
              content: text,
              append: false,
            }),
          );
          resolvedName = r?.name || requested;
          created = true;
          this.status.set(`Writing ${r?.file ?? `logs/${resolvedName}.log`}`);
        } else {
          await firstValueFrom(
            this.api.post("/chat/qa-log", { name: resolvedName, content: text, append: true }),
          );
        }
      } catch {
        this.status.set("Log write failed — see console for transcript");
      }
    };

    try {
      await runQaHarness(host, {
        count,
        logName: requested,
        customerMode,
        onProgress: (done, total) => this.status.set(`QA ${done}/${total}`),
        cancelled: () => !this.running(),
        onChunk: writeChunk,
      });
      this.status.set(
        (this.running() ? "Saved " : "Stopped — saved ") + `logs/${resolvedName}.log`,
      );
    } finally {
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
