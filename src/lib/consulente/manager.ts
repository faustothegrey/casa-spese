// Gestione delle istanze agentapi, una per backend (Claude / Codex / Antigravity).
// agentapi pilota la CLI dell'agente in modalità INTERATTIVA (terminale emulato via PTY):
// così l'uso pesa sull'ABBONAMENTO e non sulle API. Per Codex/Antigravity rimuoviamo
// le API key dall'ambiente del sottoprocesso, altrimenti le CLI userebbero le API a pagamento.
import { spawn, type ChildProcess } from "node:child_process";
import os from "node:os";
import { buildContext } from "@/lib/consulente/context";

export type Backend = "claude" | "codex" | "antigravity";

interface BackendCfg {
  label: string;
  port: number;
  agentapiType: string; // tipo agente per agentapi (claude/codex/custom)
  command: string[]; // comando reale dopo "--"
  stripEnv: string[]; // env var da rimuovere per usare l'abbonamento e non le API
  // Se impostato, il contesto viene passato come system prompt all'avvio (niente echo nel terminale).
  // Altrimenti viene iniettato come primo messaggio (vedi route /message).
  sysPromptFlag?: string;
}

const HOME = os.homedir();
const AGENTAPI = `${HOME}/.local/bin/agentapi`;

export const BACKENDS: Record<Backend, BackendCfg> = {
  claude: {
    label: "Claude",
    port: 3284,
    agentapiType: "claude",
    command: ["claude"],
    stripEnv: [],
    sysPromptFlag: "--append-system-prompt",
  },
  codex: { label: "Codex", port: 3285, agentapiType: "codex", command: ["codex"], stripEnv: ["OPENAI_API_KEY"] },
  antigravity: {
    label: "Antigravity",
    port: 3286,
    agentapiType: "custom",
    command: ["agy"],
    stripEnv: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  },
};

export function isBackend(v: unknown): v is Backend {
  return typeof v === "string" && v in BACKENDS;
}

interface Instance {
  proc: ChildProcess;
  port: number;
  contextSent: boolean;
  starting?: Promise<void>;
}

// Mappa persistente tra ricariche (HMR di Next in dev).
const g = globalThis as unknown as { __consulente?: Map<Backend, Instance> };
const instances: Map<Backend, Instance> = g.__consulente ?? (g.__consulente = new Map());

function childEnv(strip: string[]): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const k of strip) delete env[k];
  // Assicura che claude/codex/agy/agentapi siano raggiungibili anche se il PATH del server è ridotto.
  env.PATH = `${HOME}/.local/bin:/usr/local/bin:${env.PATH ?? ""}`;
  return env;
}

async function waitStable(port: number, timeoutMs = 60000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/status`);
      if (r.ok) {
        const j = (await r.json()) as { status?: string };
        if (j.status === "stable") return;
      }
    } catch {
      // server non ancora in ascolto: riprova
    }
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error("agentapi non è diventato pronto entro il timeout");
}

export async function ensureRunning(backend: Backend): Promise<number> {
  const cfg = BACKENDS[backend];
  const existing = instances.get(backend);
  if (existing) {
    if (existing.starting) await existing.starting;
    return existing.port;
  }
  // Per i backend con system prompt (Claude) iniettiamo il contesto all'avvio: niente echo nel terminale.
  const agentCmd = [...cfg.command];
  if (cfg.sysPromptFlag) agentCmd.push(cfg.sysPromptFlag, buildContext());
  // Terminale emulato largo per ridurre i ritorni a capo a metà parola nelle risposte.
  const args = [
    "server",
    "--port",
    String(cfg.port),
    "--type",
    cfg.agentapiType,
    "--term-width",
    "220",
    "--",
    ...agentCmd,
  ];
  const proc = spawn(AGENTAPI, args, {
    cwd: process.cwd(),
    env: childEnv(cfg.stripEnv),
    stdio: "ignore",
    detached: false,
  });
  // Se il contesto è già nel system prompt, non va re-iniettato come messaggio.
  const inst: Instance = { proc, port: cfg.port, contextSent: !!cfg.sysPromptFlag };
  inst.starting = waitStable(cfg.port).finally(() => {
    inst.starting = undefined;
  });
  instances.set(backend, inst);
  proc.on("exit", () => {
    if (instances.get(backend)?.proc === proc) instances.delete(backend);
  });
  await inst.starting;
  return cfg.port;
}

// Porta dell'istanza già avviata, oppure null (non avvia nulla: per il polling dei messaggi).
export function runningPort(backend: Backend): number | null {
  return instances.get(backend)?.port ?? null;
}

export function isContextSent(backend: Backend): boolean {
  return instances.get(backend)?.contextSent ?? false;
}

export function markContextSent(backend: Backend): void {
  const i = instances.get(backend);
  if (i) i.contextSent = true;
}

export function stop(backend: Backend): void {
  const i = instances.get(backend);
  if (i) {
    try {
      i.proc.kill();
    } catch {
      // già terminato
    }
    instances.delete(backend);
  }
}
