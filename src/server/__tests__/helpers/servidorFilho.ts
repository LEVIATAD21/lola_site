import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer as createNetServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Suporte para testes de BOOT: sobem `server.ts` / `data-server.ts` como
 * processo filho real, capturam a saída e esperam padrões de log.
 *
 * Por que processo filho e não import do módulo: os entrypoints chamam
 * `listen()` no topo do módulo — importar seria subir servidor dentro do
 * worker do teste, com porta fixa e estado global. Como processo filho, cada
 * teste tem a sua porta, o seu diretório temporário e o seu ambiente; os
 * filhos são mortos pelo PID (um a um, nunca com `pkill -f`, que casaria com
 * o shell do próprio agente).
 *
 * Regras: nunca `.data` de verdade (sempre diretório temporário), nunca
 * `process.env` do teste contaminado (base limpa + overrides explícitos).
 */

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
// Carrega TypeScript diretamente no processo Node, sem o socket IPC do CLI tsx.
// Os servidores e as verificações HTTP continuam sendo executados de verdade.

export interface ProcessoFilho {
  child: ChildProcess;
  /** Saída acumulada (stdout + stderr) até agora. */
  saida: () => string;
  /** Resolve com a saída inteira quando o padrão aparece; rejeita se o processo morrer antes. */
  esperar: (padrao: RegExp, timeoutMs?: number) => Promise<string>;
  /** Espera o processo sair e devolve código/sinal. */
  esperarSaida: (timeoutMs?: number) => Promise<{ codigo: number | null; sinal: string | null }>;
}

const filhos: ChildProcess[] = [];
const temporarios: string[] = [];

/** Diretório temporário para dados de teste — NUNCA o `.data` do projeto. */
export function diretorioTemporario(prefixo = 'lola-boot-'): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefixo));
  temporarios.push(dir);
  return dir;
}

/** Porta efêmera com nada escutando (a corrida é mínima e aceita aqui). */
export function portaLivre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
    server.once('error', reject);
  });
}

/**
 * Sobe um entrypoint com `tsx` como processo filho.
 *
 * Base: `LOLA_INTERNAL_SECRET` válido (sem ele o data-server nem tenta subir),
 * TLS zerado (segredo nunca herdado do teste) e `NODE_ENV` fixo — cada teste
 * sobrepõe o que precisa, depois do spread.
 */
export function subirEntryPoint(script: string, env: Record<string, string>): ProcessoFilho {
  const child = spawn(process.execPath, ['--import', 'tsx', script], {
    cwd: raiz,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      LOLA_INTERNAL_SECRET: randomBytes(32).toString('hex'),
      LOLA_TLS_CERT_FILE: '',
      LOLA_TLS_KEY_FILE: '',
      ...env,
    } as NodeJS.ProcessEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  filhos.push(child);

  let buffer = '';
  let encerrado = false;
  const esperadores: Array<{ padrao: RegExp; resolver: (texto: string) => void; rejeitar: (erro: Error) => void }> = [];
  const anexar = (pedaco: unknown) => {
    buffer += String(pedaco);
    for (let index = esperadores.length - 1; index >= 0; index -= 1) {
      const esperador = esperadores[index];
      if (esperador.padrao.test(buffer)) {
        esperadores.splice(index, 1);
        esperador.resolver(buffer);
      }
    }
  };
  child.stdout?.on('data', anexar);
  child.stderr?.on('data', anexar);
  child.once('close', (codigo, sinal) => {
    encerrado = true;
    // Processo morreu antes do padrão esperado: falha RÁPIDA com a saída
    // inteira, em vez de um timeout por teste.
    for (const esperador of esperadores.splice(0)) {
      esperador.rejeitar(new Error(
        `Processo saiu (código ${codigo}, sinal ${sinal}) antes do padrão — saída:\n${buffer}`,
      ));
    }
  });

  return {
    child,
    saida: () => buffer,
    esperar: (padrao, timeoutMs = 25_000) => new Promise<string>((resolve, reject) => {
      if (padrao.test(buffer)) return resolve(buffer);
      if (encerrado) {
        return reject(new Error(`Processo já saiu antes do padrão ${String(padrao)} — saída:\n${buffer}`));
      }
      const esperador = { padrao, resolver: resolve, rejeitar: reject };
      esperadores.push(esperador);
      setTimeout(() => {
        const posicao = esperadores.indexOf(esperador);
        if (posicao >= 0) esperadores.splice(posicao, 1);
        reject(new Error(`Timeout esperando ${String(padrao)} — saída até agora:\n${buffer}`));
      }, timeoutMs);
    }),
    esperarSaida: (timeoutMs = 15_000) => new Promise((resolve, reject) => {
      if (child.exitCode !== null || child.signalCode !== null) {
        return resolve({ codigo: child.exitCode, sinal: child.signalCode });
      }
      child.once('close', (codigo, sinal) => resolve({ codigo, sinal }));
      setTimeout(() => reject(new Error(`Timeout esperando o processo sair — saída:\n${buffer}`)), timeoutMs);
    }),
  };
}

/** Mata todos os filhos subidos pelo módulo, um a um, pelo PID. */
export function matarTodosOsFilhos(): void {
  for (const child of filhos.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  }
}

/** Remove os diretórios temporários criados para dados/TLS de teste. */
export function limparTemporarios(): void {
  for (const dir of temporarios.splice(0)) rmSync(dir, { recursive: true, force: true });
}
