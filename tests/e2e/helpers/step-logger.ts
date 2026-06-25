// tests/e2e/helpers/step-logger.ts
import * as fs from 'fs';

function nextRunId(): string {
  const logDir = 'logs';
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const dirs = fs.readdirSync(logDir).filter(d => d.startsWith('e2e-qa-harness_'));
  const next = dirs.length + 1;
  return String(next).padStart(5, '0');
}

const RUN_ID = `${nextRunId()}_${new Date().toTimeString().slice(0, 5).replace(':', '')}`;
const RUN_DIR = `logs/e2e-qa-harness_${RUN_ID}`;
fs.mkdirSync(RUN_DIR, { recursive: true });

export class StepLogger {
  private fd: number;
  private stepCount = 0;
  private warnings = 0;
  private failures = 0;

  constructor(scenarioId: string) {
    const path = `${RUN_DIR}/scenario-${String(scenarioId).padStart(2, '0')}.log`;
    this.fd = fs.openSync(path, 'a');
    // Close gracefully on exit/crash
    const close = () => { try { fs.closeSync(this.fd); } catch {} };
    process.on('exit', close);
    process.on('SIGINT', () => { close(); process.exit(1); });
    process.on('SIGTERM', () => { close(); process.exit(1); });
  }

  step(title: string): void {
    this.stepCount++;
    const ts = new Date().toISOString();
    const header = [
      `═══════════════════════════════════════════════════════════`,
      `STEP ${this.stepCount} - ${title}   [${ts}]`,
      `═══════════════════════════════════════════════════════════`,
      '',
    ].join('\n');
    fs.writeSync(this.fd, header);
    fs.fsyncSync(this.fd);
  }

  ok(label: string, detail = ''): void {
    this.writeLine(`  ✓ ${label}${detail ? ': ' + detail : ''}`);
  }

  fail(label: string, detail = ''): void {
    this.failures++;
    this.writeLine(`  ✗ ${label}${detail ? ': ' + detail : ''}`);
  }

  warn(label: string, detail = ''): void {
    this.warnings++;
    this.writeLine(`  ⚠ ${label}${detail ? ': ' + detail : ''}`);
  }

  info(label: string, detail = ''): void {
    this.writeLine(`  ℹ ${label}${detail ? ': ' + detail : ''}`);
  }

  network(method: string, url: string, status: number, ms: number): void {
    this.writeLine(`  NET ${method} ${url} → ${status} (${ms}ms)`);
  }

  consoleError(text: string, source?: string): void {
    this.warnings++;
    this.writeLine(`  ⚠ CONSOLE: ${text}${source ? ` [${source}]` : ''}`);
  }

  db(label: string, detail: string): void {
    this.writeLine(`  DB  ${label}: ${detail}`);
  }

  screenshot(label: string, page: any): void {
    // called after page.screenshot - just logs the filename
    this.writeLine(`  📷 ${label}`);
  }

  rootCause(title: string, analysis: string): void {
    const block = [
      `  ─────────────────────────────────────────────────────`,
      `  ROOT CAUSE: ${title}`,
      analysis,
      `  ─────────────────────────────────────────────────────`,
    ].join('\n');
    fs.writeSync(this.fd, block + '\n');
    fs.fsyncSync(this.fd);
  }

  summary(): { steps: number; warnings: number; failures: number } {
    const summary = [
      '',
      `────────────────────────────────────────────────────────`,
      `SUMMARY: ${this.stepCount} steps, ${this.failures} failures, ${this.warnings} warnings`,
      `────────────────────────────────────────────────────────`,
      '',
    ].join('\n');
    fs.writeSync(this.fd, summary);
    fs.fsyncSync(this.fd);
    return { steps: this.stepCount, warnings: this.warnings, failures: this.failures };
  }

  private writeLine(line: string): void {
    fs.writeSync(this.fd, line + '\n');
    fs.fsyncSync(this.fd);
  }
}
