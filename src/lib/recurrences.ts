// Ricorrenze: spese che NON sono nell'estratto del conto ma sono prevedibili.
// - contante (es. Katerina, ogni mercoledì)
// - Nexi fisse (es. Internet, una volta al mese)
// Sono regole versionate (data/recurrences.json). L'app GENERA le occorrenze attese
// per un periodo e le PROPONE; l'utente conferma con "Inserisci".

export const RECUR_VERSION = "2026.06";

export type Cadenza =
  | { tipo: "settimanale"; giorno: number } // 0=domenica … 6=sabato
  | { tipo: "mensile"; giorno: number }; // giorno del mese (1..31)

export interface Recurrence {
  id: string;
  nome: string;
  categoria: string;
  importo: number;
  fonte: "contante" | "nexi";
  cadenza: Cadenza;
  anticipa: "fausto" | "al";
  attiva: boolean;
}

export interface Occorrenza {
  id: string; // recId|dateStr (stabile)
  dateStr: string; // "DD-MM-YYYY"
  importo: number;
  rec: Recurrence;
}

export const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

// Contenuto iniziale (modificabile poi via data/recurrences.json)
export const SEED_RECURRENCES: Recurrence[] = [
  {
    id: "REC-katerina",
    nome: "Katerina",
    categoria: "Katerina",
    importo: 50,
    fonte: "contante",
    cadenza: { tipo: "settimanale", giorno: 3 }, // mercoledì
    anticipa: "fausto",
    attiva: true,
  },
  {
    id: "REC-internet",
    nome: "Internet",
    categoria: "Internet",
    importo: 43.07,
    fonte: "nexi",
    cadenza: { tipo: "mensile", giorno: 15 },
    anticipa: "fausto",
    attiva: true,
  },
];

const pad2 = (n: number) => String(n).padStart(2, "0");
const toStr = (d: Date) => `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;

// Genera le occorrenze attese di una ricorrenza dentro [start, end] (inclusi).
export function generaOccorrenze(rec: Recurrence, start: Date, end: Date): Occorrenza[] {
  const out: Occorrenza[] = [];
  if (!rec.attiva) return out;

  if (rec.cadenza.tipo === "settimanale") {
    const d = new Date(start);
    while (d <= end) {
      if (d.getDay() === rec.cadenza.giorno) {
        const ds = toStr(d);
        out.push({ id: `${rec.id}|${ds}`, dateStr: ds, importo: rec.importo, rec });
      }
      d.setDate(d.getDate() + 1);
    }
  } else {
    // mensile: il periodo va dal 24 al 23, a cavallo di due mesi di calendario.
    // giorno >= 24 cade nel mese di 'start'; giorno <= 23 nel mese di 'end'.
    const g = rec.cadenza.giorno;
    const base = g >= 24 ? start : end;
    const d = new Date(base.getFullYear(), base.getMonth(), g);
    if (d >= start && d <= end) {
      const ds = toStr(d);
      out.push({ id: `${rec.id}|${ds}`, dateStr: ds, importo: rec.importo, rec });
    }
  }
  return out;
}
