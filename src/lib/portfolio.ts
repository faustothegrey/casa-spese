// Dati del patrimonio (snapshot), seed dal Vault "Riepilogo Patrimonio" al 13/06/2026.
// Tenuti come dati espliciti e versionati, nello spirito del resto del progetto:
// in futuro possono diventare un file JSON con store/API (come rules/recurrences).

export const PORTFOLIO_SNAPSHOT_DATE = "2026-06-13";

export type AssetClass = "liquidita" | "titoli_stato" | "deposito_vincolato";

// Flusso di cassa atteso da una posizione (cedola o rimborso del capitale).
export interface Cedola {
  data: string; // YYYY-MM-DD
  tipo: "cedola" | "rimborso";
  lordo: number; // €
  netto: number; // € al netto della tassazione (il capitale rimborsato non è tassato)
}

export interface Holding {
  id: string;
  nome: string;
  rapporto: string; // numero conto / dossier
  assetClass: AssetClass;
  valore: number; // controvalore in €
  disponibile?: number; // se diverso dal valore (es. c/c)
  garantito: boolean; // capitale garantito (FITD o titolo di Stato)
  scadenza?: string; // YYYY-MM-DD, se applicabile
  rendimentoLordo?: number; // tasso/cedola lordo annuo in % sul nominale
  tassazione?: number; // aliquota fiscale in % (12,5 BTP / 26 deposito)
  plLatente?: number; // P&L latente in € (titoli di mercato)
  cedole?: Cedola[]; // calendario completo dei flussi (storico + futuri)
  nota?: string;
}

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  liquidita: "Liquidità",
  titoli_stato: "Titoli di Stato",
  deposito_vincolato: "Deposito vincolato",
};

// --- Contesto di mercato (Vault "Contesto di Mercato 2026-06"), al 13/06/2026 ---
export const MARKET = {
  asOf: "2026-06-13",
  inflazione: 3.2, // % Eurozona, mag 2026
  bceDeposito: 2.25, // % tasso BCE sui depositi
  btp10y: 3.71, // % rendimento BTP 10 anni
  spxYtd: 8.5, // % S&P 500 da inizio 2026
  depositi12m: [2.75, 3.5] as [number, number], // % lordi conti deposito vincolati 12m
};

// Cedole trimestrali del BTP Valore (€353,97 lordi, 12,5% → €309,72 netti),
// dal 05/06/2024 alla scadenza, più il rimborso del nominale a scadenza.
function btpCedole(): Cedola[] {
  const out: Cedola[] = [];
  const lordo = 353.97;
  const netto = 309.72; // 353,97 × 0,875
  for (let y = 2024; y <= 2030; y++) {
    for (const m of [3, 6, 9, 12]) {
      if (y === 2024 && m < 6) continue; // prima cedola: 05/06/2024
      if (y === 2030 && m > 3) break; // scadenza 05/03/2030
      out.push({ data: `${y}-${String(m).padStart(2, "0")}-05`, tipo: "cedola", lordo, netto });
    }
  }
  out.push({ data: "2030-03-05", tipo: "rimborso", lordo: 50000, netto: 50000 });
  return out;
}

// Cedole annuali del Time Deposit step-up (importi dal Documento di Sintesi, tassate 26%).
const timeDepositCedole: Cedola[] = [
  { data: "2025-03-03", tipo: "cedola", lordo: 1875, netto: 1387.5 }, // 3,75% — incassata
  { data: "2026-03-02", tipo: "cedola", lordo: 2000, netto: 1480 }, // 4,00% — incassata
  { data: "2027-03-01", tipo: "cedola", lordo: 2125, netto: 1572.5 }, // 4,25%
  { data: "2028-03-01", tipo: "cedola", lordo: 2250, netto: 1665 }, // 4,50%
  { data: "2028-03-01", tipo: "rimborso", lordo: 50000, netto: 50000 },
];

// Snapshot reale (esclude il conto della madre). Totale ~€135.122.
export const SEED_HOLDINGS: Holding[] = [
  {
    id: "conto-corrente",
    nome: "Conto Corrente",
    rapporto: "C/c 30793558",
    assetClass: "liquidita",
    valore: 34020.03,
    disponibile: 33580.27,
    garantito: true, // FITD fino a €100k (cumulato col Time Deposit)
    rendimentoLordo: 0,
    tassazione: 26,
    nota: "Liquidità operativa, copertura FITD cumulata con il Time Deposit. Rende 0%.",
  },
  {
    id: "btp-valore-2030",
    nome: "BTP Valore 2030",
    rapporto: "Dossier 711597",
    assetClass: "titoli_stato",
    valore: 51102.05,
    garantito: true, // rischio emittente (Stato), fuori FITD
    scadenza: "2030-03-05",
    rendimentoLordo: 2.83, // cedola trimestrale €353,97 -> €1.415,88/anno sul nominale
    tassazione: 12.5,
    plLatente: 1075.0,
    cedole: btpCedole(),
    nota: "ISIN IT0005583478. Cedola trimestrale €353,97. Liquidabile sul mercato.",
  },
  {
    id: "time-deposit",
    nome: "Time Deposit Banca Cambiano",
    rapporto: "Rapporto 725374524",
    assetClass: "deposito_vincolato",
    valore: 50000.0,
    garantito: true, // FITD
    scadenza: "2028-03-01",
    rendimentoLordo: 4.25, // step-up, tasso anno corrente (03/2026-03/2027)
    tassazione: 26,
    cedole: timeDepositCedole,
    nota: "Step-up 48 mesi. Penale estinzione anticipata 0,50%. Bollo titoli 0,20%/anno.",
  },
];

export function totalePatrimonio(holdings: Holding[]): number {
  return holdings.reduce((s, h) => s + h.valore, 0);
}

// Aggregazione per asset class: valore e quota %.
export function allocazione(
  holdings: Holding[]
): { assetClass: AssetClass; valore: number; quota: number }[] {
  const tot = totalePatrimonio(holdings) || 1;
  const map = new Map<AssetClass, number>();
  for (const h of holdings) {
    map.set(h.assetClass, (map.get(h.assetClass) || 0) + h.valore);
  }
  return [...map.entries()]
    .map(([assetClass, valore]) => ({ assetClass, valore, quota: valore / tot }))
    .sort((a, b) => b.valore - a.valore);
}

// --- Rendimenti ---

// Rendimento netto (% annuo) = lordo × (1 − aliquota). Il bollo titoli (~0,20%/anno)
// è trascurato qui e segnalato come nota, coerentemente col Vault.
export function rendimentoNetto(h: Holding): number | null {
  if (h.rendimentoLordo == null) return null;
  return h.rendimentoLordo * (1 - (h.tassazione ?? 0) / 100);
}

// Rendimento reale netto (% annuo) = netto − inflazione. Negativo = erode potere d'acquisto.
export function rendimentoRealeNetto(h: Holding, inflazione = MARKET.inflazione): number | null {
  const n = rendimentoNetto(h);
  return n == null ? null : n - inflazione;
}

// --- Calendario flussi futuri (cedole + rimborsi) ---

export interface FlussoFuturo extends Cedola {
  holdingId: string;
  holdingNome: string;
}

export function flussiFuturi(holdings: Holding[], fromISO: string): FlussoFuturo[] {
  const out: FlussoFuturo[] = [];
  for (const h of holdings) {
    for (const c of h.cedole ?? []) {
      if (c.data >= fromISO) {
        out.push({ ...c, holdingId: h.id, holdingNome: h.nome });
      }
    }
  }
  return out.sort((a, b) => a.data.localeCompare(b.data));
}

// Reddito netto atteso (solo cedole, no rimborsi) entro `fromISO` + 12 mesi.
export function cedoleProssimi12Mesi(holdings: Holding[], fromISO: string): number {
  const from = new Date(fromISO);
  const to = new Date(from);
  to.setFullYear(to.getFullYear() + 1);
  const toISO = to.toISOString().slice(0, 10);
  return flussiFuturi(holdings, fromISO)
    .filter((f) => f.tipo === "cedola" && f.data < toISO)
    .reduce((s, f) => s + f.netto, 0);
}
