import { app, clipboard, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { toBusinessVersion } from '../version';

const MAX_LOG_BYTES = 2 * 1024 * 1024;
const MAX_ROTATED_FILES = 3;

const BLOCKED_KEY = /(token|api.?key|authorization|screenshot|base64|audio(content|data)?|transcript|resume|jobDescription|email|uploadUrl|signedUrl|filePath|fullPath)/i;

export type DiagnosticLogName = 'exam-analysis' | 'interview-audio';

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 3) return '[truncated]';
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.replace(/https?:\/\/[^\s"']+/g, '[url]').slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
  if (typeof value !== 'object') return String(value).slice(0, 200);
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (BLOCKED_KEY.test(key)) continue;
    result[key] = sanitizeValue(item, depth + 1);
  }
  return result;
}

export function sanitizeDiagnosticDetails(details: Record<string, unknown>): Record<string, unknown> {
  return sanitizeValue(details) as Record<string, unknown>;
}

export class DiagnosticLogger {
  private logDir(): string {
    return path.join(app.getPath('userData'), 'logs');
  }

  private logPath(name: DiagnosticLogName): string {
    return path.join(this.logDir(), `${name}.log`);
  }

  append(name: DiagnosticLogName, event: string, details: Record<string, unknown>): boolean {
    try {
      fs.mkdirSync(this.logDir(), { recursive: true });
      const target = this.logPath(name);
      this.rotateIfNeeded(target);
      const entry = {
        timestamp: new Date().toISOString(),
        appVersion: app.getVersion(),
        businessVersion: toBusinessVersion(app.getVersion()),
        platform: process.platform,
        arch: process.arch,
        event,
        ...sanitizeDiagnosticDetails(details),
      };
      fs.appendFileSync(target, `${JSON.stringify(entry)}\n`, 'utf8');
      return true;
    } catch {
      return false;
    }
  }

  copySummary(summary: Record<string, unknown>): boolean {
    try {
      clipboard.writeText(JSON.stringify(sanitizeDiagnosticDetails(summary), null, 2));
      return true;
    } catch {
      return false;
    }
  }

  async openFolder(): Promise<boolean> {
    try {
      fs.mkdirSync(this.logDir(), { recursive: true });
      return (await shell.openPath(this.logDir())) === '';
    } catch {
      return false;
    }
  }

  private rotateIfNeeded(target: string): void {
    if (!fs.existsSync(target) || fs.statSync(target).size < MAX_LOG_BYTES) return;
    for (let index = MAX_ROTATED_FILES - 1; index >= 1; index -= 1) {
      const source = `${target}.${index}`;
      const destination = `${target}.${index + 1}`;
      if (fs.existsSync(source)) fs.renameSync(source, destination);
    }
    fs.renameSync(target, `${target}.1`);
    const expired = `${target}.${MAX_ROTATED_FILES + 1}`;
    if (fs.existsSync(expired)) fs.unlinkSync(expired);
  }
}
