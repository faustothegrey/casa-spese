// Costruisce il "preambolo di contesto" iniettato al primo messaggio di ogni conversazione:
// snapshot del patrimonio (da lib/portfolio) + le note di approfondimento dal Vault.
// Così l'agente risponde con tutti i dati in mano, senza dover usare strumenti (niente prompt di permesso).
import { readFileSync, existsSync } from "node:fs";
import {
  SEED_HOLDINGS,
  MARKET,
  ASSET_CLASS_LABEL,
  totalePatrimonio,
  allocazione,
  rendimentoNetto,
  rendimentoRealeNetto,
} from "@/lib/portfolio";

const VAULT = process.env.CASASPESE_VAULT ?? "/Users/fausto/Cowork-Projects/MyFinance2/Vault";

// Note del Vault scelte come contesto (scope: patrimonio + analisi investimenti).
const NOTES = [
  "Patrimonio/Riepilogo Patrimonio.md",
  "Flussi/Performance vs Mercato.md",
  "Flussi/Contesto di Mercato 2026-06.md",
  "Patrimonio/BTP Valore 2030.md",
  "Patrimonio/Time Deposit Banca Cambiano.md",
  "Patrimonio/Conto Corrente.md",
];

const eur = (n: number) =>
  n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

export const CONTEXT_MARKER = "Prima domanda dell'utente:";

export function buildContext(): string {
  const tot = totalePatrimonio(SEED_HOLDINGS);
  const holdings = SEED_HOLDINGS.map((h) => {
    const net = rendimentoNetto(h);
    const real = rendimentoRealeNetto(h);
    return `- ${h.nome} (${ASSET_CLASS_LABEL[h.assetClass]}): ${eur(h.valore)}; rend. lordo ${
      h.rendimentoLordo ?? 0
    }% · netto ${net != null ? net.toFixed(2) : "?"}% · reale netto ${
      real != null ? real.toFixed(1) : "?"
    }%; scadenza ${h.scadenza ?? "—"}; P&L latente ${
      h.plLatente != null ? eur(h.plLatente) : "—"
    }.`;
  }).join("\n");

  const alloc = allocazione(SEED_HOLDINGS)
    .map((a) => `${ASSET_CLASS_LABEL[a.assetClass]} ${(a.quota * 100).toFixed(0)}%`)
    .join(", ");

  let notes = "";
  for (const rel of NOTES) {
    const p = `${VAULT}/${rel}`;
    if (existsSync(p)) {
      try {
        notes += `\n\n### ${rel}\n${readFileSync(p, "utf8")}`;
      } catch {
        // nota non leggibile: la salto
      }
    }
  }

  return [
    "Sei un consulente finanziario che analizza il patrimonio personale di Fausto.",
    "Rispondi SEMPRE in italiano, in modo chiaro e conciso, basandoti SOLO sui dati qui sotto.",
    "Non usare strumenti o comandi: hai già tutti i dati necessari in questo messaggio.",
    "Ragiona quando utile su rendimento reale netto, rischio di concentrazione, scadenze e liquidità.",
    "",
    `## Snapshot patrimonio (al ${MARKET.asOf})`,
    `Totale: ${eur(tot)} · Allocazione: ${alloc}`,
    holdings,
    "",
    "## Contesto di mercato",
    `Inflazione ${MARKET.inflazione}% · BCE depositi ${MARKET.bceDeposito}% · BTP 10Y ${MARKET.btp10y}% · depositi 12m ${MARKET.depositi12m[0]}–${MARKET.depositi12m[1]}% · S&P 500 +${MARKET.spxYtd}% YTD`,
    "",
    "## Note di approfondimento dal Vault",
    notes.trim(),
  ].join("\n");
}
