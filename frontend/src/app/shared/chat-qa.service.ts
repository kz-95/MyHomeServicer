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
    void this.run(host, opts.count ?? 100, opts.customerMode === true, false);
  }

  /** Begin the DEMO flow: 4 fixed guaranteed-pass bookings (en/ms/zh/ta), 0 → review.
   *  No-op if a run is already going. */
  startDemo(host: QaHost): void {
    if (this.running()) return;
    void this.run(host, 4, false, true);
  }

  /** Cancel the in-flight run; the harness checks this between scenarios. */
  cancel(): void {
    this.running.set(false);
  }

  private async run(host: QaHost, count: number, customerMode: boolean, demo: boolean): Promise<void> {
    this.running.set(true);
    const requested = this.makeLogName();
    let resolvedName = requested;
    let created = false;
    let buffered = ""; // chunks that failed to write (file locked)

    const tryWrite = async (name: string, content: string, append: boolean): Promise<boolean> => {
      try {
        await firstValueFrom(this.api.post("/chat/qa-log", { name, content, append }));
        return true;
      } catch {
        return false;
      }
    };

    const writeChunk = async (text: string): Promise<void> => {
      // Console-mirror every non-empty line in real time.
      for (const line of text.split("\n")) {
        const t = line.trimEnd();
        if (t) console.log(t);
      }

      // Flush previous buffered chunk first, then write this one.
      if (buffered) {
        if (await tryWrite(resolvedName, buffered, true)) buffered = "";
      }

      if (!created) {
        const r = await firstValueFrom(
          this.api.post<{ ok: boolean; name: string; file: string }>("/chat/qa-log", {
            name: requested, content: text, append: false,
          }),
        ).catch(() => null);
        if (r?.ok) { resolvedName = r.name; created = true; this.status.set(`Writing logs/${r.file}`); }
        else { buffered += text; }
      } else {
        if (!(await tryWrite(resolvedName, text, true))) buffered += text;
      }

      if (buffered) this.status.set("Log buffered (file locked) — retrying");
    };

    try {
      await runQaHarness(host, {
        count, logName: requested, customerMode, demo,
        onProgress: (done, total) => this.status.set(`${demo ? "Demo" : "QA"} ${done}/${total}`),
        cancelled: () => !this.running(),
        onChunk: writeChunk,
      });
    } catch (e) {
      await writeChunk(`\n---\n## RUN ERROR\n${(e as Error)?.message ?? String(e)}\n`);
    } finally {
      // Flush buffer with retries, then report.
      // If the file was never created (first write failed due to lock/network),
      // try creating it now with all buffered content so Stop QA always saves.
      if (!created && buffered) {
        const r = await firstValueFrom(
          this.api.post<{ ok: boolean; name: string; file: string }>("/chat/qa-log", {
            name: requested, content: buffered, append: false,
          }),
        ).catch(() => null);
        if (r?.ok) { resolvedName = r.name; created = true; buffered = ""; this.status.set(`Writing logs/${r.file}`); }
      }
      for (let i = 0; i < 3 && buffered && created; i++) {
        await new Promise((r) => setTimeout(r, 600));
        if (await tryWrite(resolvedName, buffered, true)) buffered = "";
      }
      this.status.set(
        buffered
          ? `Log partially saved — ${buffered.length} bytes not written (see console)`
          : `Saved logs/${resolvedName}.log`,
      );
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
