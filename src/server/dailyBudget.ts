import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

interface UsageRecord { date: string; used: number; }

/** Persistent per-instance daily cap for expensive external AI calls. Set a provider-side quota too. */
export class PersistentDailyBudget {
  private readonly filePath: string;
  private readonly limit: number;
  private record: UsageRecord;
  readonly ready: boolean;
  readonly unavailableReason: string | null;

  constructor(directory: string, limit: number, now = new Date()) {
    this.filePath = join(directory, 'ai-daily-budget.json');
    this.limit = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 100_000) : 200;
    let record: UsageRecord = { date: now.toISOString().slice(0, 10), used: 0 };
    let reason: string | null = null;
    try {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      if (existsSync(this.filePath)) {
        const loaded: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'));
        if (!loaded || typeof loaded !== 'object' || !('date' in loaded) || !('used' in loaded) ||
            typeof (loaded as UsageRecord).date !== 'string' ||
            !Number.isSafeInteger((loaded as UsageRecord).used) || (loaded as UsageRecord).used < 0) {
          throw new Error('Formato inválido no contador diário de IA.');
        }
        const parsed = loaded as UsageRecord;
        if (parsed.date === record.date) record = parsed;
      }
      this.record = record;
      this.ready = this.persistRecord(record);
      if (!this.ready) reason = 'Não foi possível persistir o limite diário de consultas de IA.';
    } catch {
      this.record = record;
      this.ready = false;
      reason = 'Contador diário de IA indisponível; chamadas pagas foram desativadas por segurança.';
    }
    this.unavailableReason = reason;
  }

  private persistRecord(record: UsageRecord): boolean {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true, mode: 0o700 });
      const temporary = this.filePath + '.' + process.pid + '.tmp';
      writeFileSync(temporary, JSON.stringify(record) + '\n', { mode: 0o600 });
      renameSync(temporary, this.filePath);
      return true;
    } catch {
      return false;
    }
  }

  consume(now = new Date()): { allowed: boolean; remaining: number } {
    if (!this.ready) return { allowed: false, remaining: 0 };
    const today = now.toISOString().slice(0, 10);
    const previous = { ...this.record };
    if (this.record.date !== today) this.record = { date: today, used: 0 };
    if (this.record.used >= this.limit) {
      this.record = previous;
      return { allowed: false, remaining: 0 };
    }
    this.record.used += 1;
    if (!this.persistRecord(this.record)) {
      this.record = previous;
      return { allowed: false, remaining: 0 };
    }
    return { allowed: true, remaining: this.limit - this.record.used };
  }
}
