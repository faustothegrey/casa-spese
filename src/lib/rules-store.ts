// Persistenza delle regole come DATI VERSIONATI (server-only).
// File: data/rules.json (dentro il repo => versionabile con git).
// Ogni modifica incrementa 'revision': lo storico è ricostruibile.

import fs from "fs";
import path from "path";
import { SEED_RULES, RULES_VERSION, Rule, Stato } from "./rules";

const RULES_PATH = path.join(process.cwd(), "data", "rules.json");

export interface RuleSet {
  baseVersion: string;
  revision: number;
  updatedAt: string;
  rules: Rule[];
}

function seed(): RuleSet {
  return {
    baseVersion: RULES_VERSION,
    revision: 0,
    updatedAt: new Date().toISOString(),
    rules: SEED_RULES,
  };
}

export function loadRules(): RuleSet {
  try {
    const raw = fs.readFileSync(RULES_PATH, "utf-8");
    return JSON.parse(raw) as RuleSet;
  } catch {
    return seed();
  }
}

export function saveRules(rs: RuleSet): void {
  fs.mkdirSync(path.dirname(RULES_PATH), { recursive: true });
  fs.writeFileSync(RULES_PATH, JSON.stringify(rs, null, 2), "utf-8");
}

// Materializza il file con il seed se non esiste ancora (così è subito versionabile).
export function ensureRulesFile(): RuleSet {
  if (!fs.existsSync(RULES_PATH)) {
    const rs = seed();
    saveRules(rs);
    return rs;
  }
  return loadRules();
}

import { loadTransactions } from "./transactions-store";

function validateRulesetNoOverlaps(rules: Rule[]) {
  const txs = loadTransactions();
  for (const t of txs) {
    const desc = t.descrizione.toUpperCase();
    const matched: string[] = [];
    for (const r of rules) {
      if (r.keywords.some((k) => k && desc.includes(k.toUpperCase()))) {
        matched.push(r.id);
      }
    }
    if (matched.length > 1) {
      throw new Error(
        `Impossibile salvare: la transazione "${t.descrizione}" verrebbe associata a più regole contemporaneamente (regole: ${matched.join(", ")}).`
      );
    }
  }
}

export function updateRule(
  id: string,
  patch: { keywords?: string[]; categoria?: string; stato?: Stato }
): RuleSet {
  const rs = loadRules();
  const idx = rs.rules.findIndex((r) => r.id === id);
  if (idx < 0) throw new Error(`Regola non trovata: ${id}`);
  const cur = rs.rules[idx];
  const stato: Stato = patch.stato ?? cur.stato;
  let categoria = patch.categoria ?? cur.categoria;
  if (stato === "ESCLUSA") categoria = "—";
  const updated: Rule = {
    ...cur,
    keywords: patch.keywords ? patch.keywords.map((k) => k.trim()).filter(Boolean) : cur.keywords,
    categoria,
    stato,
  };
  const rules = [...rs.rules];
  rules[idx] = updated;
  
  validateRulesetNoOverlaps(rules);
  
  const next: RuleSet = {
    baseVersion: rs.baseVersion,
    revision: rs.revision + 1,
    updatedAt: new Date().toISOString(),
    rules,
  };
  saveRules(next);
  return next;
}

export function addRule(input: { keywords: string[]; categoria: string; stato: Stato; nota?: string }): RuleSet {
  const rs = loadRules();
  const revision = rs.revision + 1;
  const newRule: Rule = {
    id: `U-${revision}`,
    keywords: input.keywords.map((k) => k.trim()).filter(Boolean),
    categoria: input.stato === "AUTO" ? input.categoria : "—",
    stato: input.stato,
    nota: input.nota,
  };
  const rules = [newRule, ...rs.rules];
  
  validateRulesetNoOverlaps(rules);
  
  const next: RuleSet = {
    baseVersion: rs.baseVersion,
    revision,
    updatedAt: new Date().toISOString(),
    rules,
  };
  saveRules(next);
  return next;
}

export function deleteRule(id: string): RuleSet {
  const rs = loadRules();
  const idx = rs.rules.findIndex((r) => r.id === id);
  if (idx < 0) throw new Error(`Regola non trovata: ${id}`);
  
  const rules = rs.rules.filter((r) => r.id !== id);
  
  const next: RuleSet = {
    baseVersion: rs.baseVersion,
    revision: rs.revision + 1,
    updatedAt: new Date().toISOString(),
    rules,
  };
  saveRules(next);
  return next;
}
