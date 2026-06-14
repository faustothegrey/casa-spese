// Pulizia dei messaggi restituiti da agentapi: rimuove la "chrome" del terminale (cornici,
// blocchi, glifi di spinner) e, per il primo messaggio utente, nasconde il preambolo di contesto.
import { CONTEXT_MARKER } from "./context";

// Caratteri di disegno box / blocchi / spinner usati dalle TUI degli agenti.
const TUI_CHARS = /[│┃╭╮╰╯─━┄┈┉├┤┬┴┼▏▕▌▐█▙▚▛▜▝▘▀▄■◆●○◐◓◑◒⏺✻✶✳✽✦∴·•]/g;

// Righe di stato/spinner/rumore da scartare del tutto.
const NOISE_LINE = /(esc to interrupt|esc per interrompere|Crunch|Worked for \d|Thought for \d|Analyzing [A-Z]|tokens?\b|ctrl\+|\(esc\)|press up|Welcome back|Tips for getting|release notes|What's new|\(\d+ lines? hidden\)|Run \/init|Session titles|footerLinks|Bedrock|Use \/feedback|gpt-[\d.]+\s+(medium|low|high|minimal)|gemini[\w.\- ]*\((medium|low|high)\))/i;

// Firma del banner d'avvio degli agenti: se un messaggio dell'agente la contiene, lo scartiamo.
const BANNER = /(Claude Code v\d|Run \/init|\/release-notes|Welcome to Codex|Codex CLI|OpenAI Codex|Antigravity CLI|Google AI Pro|Opus 4\.8\s+Claude Pro)/i;

export interface RawMessage {
  id: number;
  role: string;
  content: string;
  time?: string;
}

export interface CleanMessage {
  id: number;
  role: "user" | "agent";
  content: string;
  time?: string;
}

export function cleanMessage(m: RawMessage): CleanMessage | null {
  if (m.role === "user") {
    let c = m.content;
    const idx = c.indexOf(CONTEXT_MARKER);
    if (idx >= 0) c = c.slice(idx + CONTEXT_MARKER.length);
    c = c.trim();
    return c ? { id: m.id, role: "user", content: c, time: m.time } : null;
  }

  // role === agent (o altro): trattalo come output dell'agente. Scarta il banner d'avvio.
  if (BANNER.test(m.content)) return null;

  // Alcuni agenti (es. Antigravity, --type custom) ri-echeggiano l'INTERO contesto iniettato
  // dentro lo stesso messaggio, prima della risposta vera. Teniamo solo ciò che segue
  // l'ultima occorrenza del marker (la risposta), togliendo la domanda riecheggiata.
  let body = m.content;
  const mi = body.lastIndexOf(CONTEXT_MARKER);
  if (mi >= 0) {
    body = body.slice(mi + CONTEXT_MARKER.length);
    const blank = body.search(/\n[ \t]*\n/); // fine della domanda riecheggiata
    if (blank >= 0) body = body.slice(blank);
  }
  // Taglia il log di lavoro verboso di alcuni agenti (es. Antigravity).
  body = body.replace(/\n\s*Riepilogo del lavoro svolto[\s\S]*$/i, "");

  const lines = body
    .split("\n")
    .map((l) => l.replace(TUI_CHARS, "").replace(/\s+$/g, ""))
    .filter((l) => !NOISE_LINE.test(l));

  const out = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return out ? { id: m.id, role: "agent", content: out, time: m.time } : null;
}

export function cleanMessages(messages: RawMessage[]): CleanMessage[] {
  const result: CleanMessage[] = [];
  for (const m of messages) {
    const c = cleanMessage(m);
    if (c) result.push(c);
  }
  return result;
}
