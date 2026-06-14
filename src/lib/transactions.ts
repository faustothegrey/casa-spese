// Tipi e utilità condivise per i movimenti bancari (estratto Banca Cambiano).
// Estratto qui per non duplicare il codice tra le pagine.

export interface Transaction {
  dataContabile: string; // DD-MM-YYYY
  dataValuta: string; // DD-MM-YYYY
  descrizione: string;
  importo: number; // negativo = uscita
  saldo: number | null;
  ignored?: boolean;
}

export function parseItalianNumber(s: string): number {
  if (!s || s.trim() === "") return 0;
  return parseFloat(s.replace(/\./g, "").replace(",", "."));
}

export function parseCSV(text: string): Transaction[] {
  const lines = text.split("\n");
  const dataLines = lines.slice(3); // le prime 3 righe sono intestazioni Banca Cambiano
  const out: Transaction[] = [];
  for (const line of dataLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(";");
    if (parts.length < 4) continue;
    // Righe della carta Nexi ("C-…"): ignorate per scelta. Internet è gestito come
    // ricorrenza; gli altri acquisti Nexi non vengono importati.
    if ((parts[2] || "").trim().startsWith("C-")) continue;
    const dc = (parts[0] || "").trim();
    // Le righe della carta Nexi ("C-…") hanno la Data Valuta vuota: usa la contabile.
    const dv = (parts[1] || "").trim() || dc;
    out.push({
      dataContabile: dc,
      dataValuta: dv,
      descrizione: parts[2],
      importo: parseItalianNumber(parts[3]),
      saldo: parts[4] ? parseItalianNumber(parts[4]) : null,
    });
  }
  return out;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value);
}

// DD-MM-YYYY -> DD/MM/YYYY
export function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const [d, m, y] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

// Importo foglio: "€ 50,00" / "-€ 50,00" / "65,02" -> numero assoluto
export function parseSheetAmount(s: string): number {
  if (!s || s.trim() === "") return 0;
  const cleaned = s.replace(/€/g, "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  return Math.abs(parseFloat(cleaned) || 0);
}

// CSV usa DD-MM-YYYY, foglio usa DD/MM/YYYY
export function normalizeDateCSV(dateStr: string): string {
  if (!dateStr) return "";
  return dateStr.replace(/-/g, "/");
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Formato importo per il foglio: "€ 50,00"
export function toSheetAmount(n: number): string {
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `€ ${formatted}`;
}

// Chiave stabile per identificare un movimento (dedup / key React)
export function txId(t: Transaction): string {
  return `${t.dataValuta}|${round2(t.importo)}|${t.descrizione}`;
}

// --- Periodi del foglio: "dal 24 del mese prec. al 23 di questo" ---

export interface Period {
  key: string; // = data di fine (YYYY-MM-DD), usata per ordinare
  label: string; // "dal DD/MM/YYYY al DD/MM/YYYY"
  start: Date;
  end: Date;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

const MESI_ESTESI = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

// Data con mese a parole: "24 febbraio 2026"
function fmtDMY(d: Date): string {
  return `${d.getDate()} ${MESI_ESTESI[d.getMonth()]} ${d.getFullYear()}`;
}

// Accetta "DD-MM-YYYY" (CSV) e "DD/MM/YYYY" (foglio)
export function parseAnyDate(s: string): Date | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

export function periodForDate(d: Date): Period {
  let start: Date;
  let end: Date;
  if (d.getDate() >= 24) {
    start = new Date(d.getFullYear(), d.getMonth(), 24);
    end = new Date(d.getFullYear(), d.getMonth() + 1, 23);
  } else {
    start = new Date(d.getFullYear(), d.getMonth() - 1, 24);
    end = new Date(d.getFullYear(), d.getMonth(), 23);
  }
  const key = `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`;
  return { key, label: `dal ${fmtDMY(start)} al ${fmtDMY(end)}`, start, end };
}

export function periodForDateStr(s: string): Period | null {
  const d = parseAnyDate(s);
  return d ? periodForDate(d) : null;
}

// --- Dedup contro il foglio: un movimento è "già nel foglio"? ---

// key = importo -> lista date presenti nel foglio
export function buildSheetLookup(sheetData: string[][]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (let i = 1; i < sheetData.length; i++) {
    const row = sheetData[i];
    const date = (row[2] || "").trim();
    const amountStr = (row[5] || "").trim();
    if (!date || !amountStr) continue;
    const amount = parseSheetAmount(amountStr);
    if (amount === 0) continue;
    const key = String(round2(amount));
    const list = map.get(key) || [];
    list.push(date);
    map.set(key, list);
  }
  return map;
}

// Accetta sia data contabile sia valuta (lo storico è incoerente).
export function isInConti(t: Transaction, sheetLookup: Map<string, string[]>, usedIndices: Set<string>): boolean {
  if (t.importo >= 0) return false;
  const amountKey = String(round2(Math.abs(t.importo)));
  const dates = sheetLookup.get(amountKey);
  if (!dates) return false;
  const csvContabile = normalizeDateCSV(t.dataContabile);
  const csvValuta = normalizeDateCSV(t.dataValuta);
  for (let i = 0; i < dates.length; i++) {
    const uniqueId = `${amountKey}-${i}`;
    if (usedIndices.has(uniqueId)) continue;
    if (dates[i] === csvContabile || dates[i] === csvValuta) {
      usedIndices.add(uniqueId);
      return true;
    }
  }
  return false;
}
