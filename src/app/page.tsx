"use client";

import { useEffect, useState, useMemo, useCallback, type ChangeEvent } from "react";
import {
  Transaction,
  Period,
  formatCurrency,
  formatDate,
  toSheetAmount,
  buildSheetLookup,
  isInConti,
  txId,
  periodForDateStr,
  normalizeDateCSV,
  parseSheetAmount,
  round2,
} from "@/lib/transactions";
import {
  classificaWith,
  suggestKeyword,
  findMatchingRuleIds,
  Rule,
  Classificazione,
  Stato,
  CATEGORIE,
} from "@/lib/rules";
import { Recurrence, Occorrenza, generaOccorrenze } from "@/lib/recurrences";

type OpenItem = { tx: Transaction; cls: Classificazione };
type RuleSet = { baseVersion: string; revision: number; updatedAt: string; rules: Rule[] };
type RecurrenceSet = { version: string; revision: number; recurrences: Recurrence[] };
type PeriodGroup = Period & { autos: OpenItem[]; dade: OpenItem[]; recs: Occorrenza[]; excl: OpenItem[]; done: OpenItem[] };

// "DD-MM-YYYY" -> "YYYY-MM-DD" per ordinare cronologicamente
const toSortKey = (dmy: string) => (dmy || "").split("-").reverse().join("-");

const SPREADSHEET_ID = "1YazkQsziwH0N1TOu_qolzBaEIfXobfa76nE_klNHa2Q";
const CONTI_SHEET_ID = "1811352964";

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const [ruleSet, setRuleSet] = useState<RuleSet | null>(null);
  const [recSet, setRecSet] = useState<RecurrenceSet | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [showSheetFrame, setShowSheetFrame] = useState(false);
  const [expandedPeriods, setExpandedPeriods] = useState<Record<string, boolean>>({});

  const [sheetData, setSheetData] = useState<string[][] | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  const [showExcluded, setShowExcluded] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archive, setArchive] = useState<{ name: string; hash: string } | null>(null);

  const [ruleModal, setRuleModal] = useState<{
    isNew: boolean;
    id?: string;
    keywords: string;
    categoria: string;
    stato: Stato;
  } | null>(null);

  // Caricamento transazioni persistenti dal database globale
  useEffect(() => {
    fetch("/api/transactions")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.transactions) setTransactions(data.transactions);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const fetchRules = useCallback(() => {
    fetch("/api/rules").then((r) => r.json()).then(setRuleSet).catch(() => {});
  }, []);
  const fetchRecs = useCallback(() => {
    fetch("/api/recurrences").then((r) => r.json()).then(setRecSet).catch(() => {});
  }, []);
  useEffect(() => {
    fetchRules();
    fetchRecs();
  }, [fetchRules, fetchRecs]);

  const loadSheet = useCallback(() => {
    setSheetLoading(true);
    fetch("/api/sheets?sheet=conti")
      .then((res) => {
        if (res.status === 401) {
          setAuthenticated(false);
          return null;
        }
        setAuthenticated(true);
        return res.json();
      })
      .then((data) => {
        if (data?.rows) setSheetData(data.rows);
        setSheetLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setSheetLoading(false);
      });
  }, []);

  useEffect(() => {
    if (sheetData === null && !sheetLoading && authenticated !== false) loadSheet();
  }, [sheetData, sheetLoading, authenticated, loadSheet]);

  const onUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const text = await file.text();
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, content: text }),
      });
      const d = await res.json();
      if (res.ok) {
        setTransactions(d.transactions);
        setArchive({ name: d.archivedAs, hash: d.hash });
      } else {
        throw new Error(d.error || "Errore durante l'elaborazione del file");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore caricamento");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  const sheetReady = !!sheetData && sheetData.length > 1;
  const ready = sheetReady && !!ruleSet && !!recSet;

  // Periodi CHIUSI = quelli le cui righe nel foglio sono tutte "Saldato",
  // o tutti i periodi antecedenti al 24 marzo 2025 (chiave <= "2025-03-23").
  const closedPeriods = useMemo(() => {
    const closed = new Set<string>();
    if (!sheetReady) return closed;
    const seen = new Set<string>();
    const open = new Set<string>(); // periodi con almeno una riga "Da Saldare"
    for (let i = 1; i < sheetData!.length; i++) {
      const row = sheetData![i];
      const date = (row[2] || "").trim();
      if (!date) continue;
      const p = periodForDateStr(date);
      if (!p) continue;

      if (p.key < "2025-03-23") {
        closed.add(p.key);
        continue;
      }

      seen.add(p.key);
      const stato = (row[1] || "").trim().toLowerCase();
      if (stato !== "saldato") open.add(p.key);
    }
    for (const k of seen) if (!open.has(k)) closed.add(k);
    return closed;
  }, [sheetData, sheetReady]);

  // Trova il periodo più vecchio registrato nel foglio per stabilire la data di inizio
  const oldestSheetPeriodKey = useMemo(() => {
    if (!sheetReady) return null;
    let minKey = "";
    for (let i = 1; i < sheetData!.length; i++) {
      const row = sheetData![i];
      const date = (row[2] || "").trim();
      if (!date) continue;
      const p = periodForDateStr(date);
      if (!p) continue;
      if (!minKey || p.key.localeCompare(minKey) < 0) {
        minKey = p.key;
      }
    }
    return minKey || null;
  }, [sheetData, sheetReady]);

  // Smista i movimenti applicando le REGOLE
  const { autos, daDecidere, excluded, conflicts, alreadyCount, done } = useMemo(() => {
    const autos: OpenItem[] = [];
    const daDecidere: OpenItem[] = [];
    const excluded: OpenItem[] = [];
    const done: OpenItem[] = [];
    const conflicts: (OpenItem & { allMatches: string[] })[] = [];
    let alreadyCount = 0;
    if (!ready) return { autos, daDecidere, excluded, conflicts, alreadyCount, done };

    const lookup = buildSheetLookup(sheetData!);
    const used = new Set<string>();
    for (const t of transactions) {
      if (t.importo >= 0) continue;

      const p = periodForDateStr(t.dataValuta);
      if (p) {
        // Ignora transazioni precedenti all'inizio del foglio
        if (oldestSheetPeriodKey && p.key.localeCompare(oldestSheetPeriodKey) < 0) {
          continue;
        }
        // Ignora transazioni in periodi già chiusi
        if (closedPeriods.has(p.key)) {
          continue;
        }
      }

      // Se la transazione è esclusa manualmente (non tramite regola)
      if (t.ignored) {
        excluded.push({ tx: t, cls: { regolaId: "MANUALE", categoria: "—", stato: "ESCLUSA" } });
        continue;
      }

      // Rileva tutti gli ID delle regole corrispondenti
      const allMatches = findMatchingRuleIds(ruleSet!.rules, t.descrizione);
      if (allMatches.length > 1) {
        const cls = classificaWith(ruleSet!.rules, t.descrizione);
        conflicts.push({ tx: t, cls, allMatches });
        continue; // Escludi dalle altre liste per bloccare l'inserimento
      }

      const cls = classificaWith(ruleSet!.rules, t.descrizione);
      if (cls.stato === "ESCLUSA") {
        excluded.push({ tx: t, cls });
        continue;
      }
      if (isInConti(t, lookup, used)) {
        alreadyCount++;
        done.push({ tx: t, cls });
        continue;
      }
      if (cls.stato === "AUTO") autos.push({ tx: t, cls });
      else daDecidere.push({ tx: t, cls });
    }
    return { autos, daDecidere, excluded, conflicts, alreadyCount, done };
  }, [transactions, sheetData, ready, ruleSet, oldestSheetPeriodKey, closedPeriods]);

  // Raggruppa per PERIODO (24→23), solo periodi APERTI; aggiunge le ricorrenze attese
  const periods = useMemo<PeriodGroup[]>(() => {
    const map = new Map<string, PeriodGroup>();
    if (!ready) return [];

    const ensure = (p: Period): PeriodGroup => {
      let g = map.get(p.key);
      if (!g) {
        g = { ...p, autos: [], dade: [], recs: [], excl: [], done: [] };
        map.set(p.key, g);
      }
      return g;
    };

    // Assicura che tutti i periodi attivi (da oldestSheetPeriodKey fino al più recente nelle transazioni) siano presenti nel map se non sono chiusi
    for (const t of transactions) {
      const p = periodForDateStr(t.dataValuta);
      if (!p) continue;
      if (oldestSheetPeriodKey && p.key.localeCompare(oldestSheetPeriodKey) < 0) continue;
      if (closedPeriods.has(p.key)) continue;
      ensure(p);
    }

    for (const it of autos) {
      const p = periodForDateStr(it.tx.dataValuta);
      if (!p || closedPeriods.has(p.key)) continue;
      ensure(p).autos.push(it);
    }
    for (const it of daDecidere) {
      const p = periodForDateStr(it.tx.dataValuta);
      if (!p || closedPeriods.has(p.key)) continue;
      ensure(p).dade.push(it);
    }
    for (const it of excluded) {
      const p = periodForDateStr(it.tx.dataValuta);
      if (!p || closedPeriods.has(p.key)) continue;
      ensure(p).excl.push(it);
    }
    for (const it of done) {
      const p = periodForDateStr(it.tx.dataValuta);
      if (!p || closedPeriods.has(p.key)) continue;
      ensure(p).done.push(it);
    }

    // Ricorrenze: genera le attese nel periodo e proponi quelle non già nel foglio
    const occInSheet = (o: Occorrenza): boolean => {
      const dts = normalizeDateCSV(o.dateStr);
      for (let i = 1; i < sheetData!.length; i++) {
        const row = sheetData![i];
        if ((row[2] || "").trim() === dts && Math.abs(parseSheetAmount(row[5]) - round2(o.importo)) < 0.005) {
          return true;
        }
      }
      return false;
    };
    for (const g of map.values()) {
      for (const rec of recSet!.recurrences) {
        for (const o of generaOccorrenze(rec, g.start, g.end)) {
          if (!occInSheet(o)) g.recs.push(o);
        }
      }
      g.recs.sort((a, b) => a.dateStr.split("-").reverse().join().localeCompare(b.dateStr.split("-").reverse().join()));
    }
    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [transactions, autos, daDecidere, recSet, oldestSheetPeriodKey, closedPeriods, sheetData, ready, excluded, done]);

  const totalRecs = periods.reduce((s, p) => s + p.recs.length, 0);

  // --- Inserimenti (sempre risultato di una regola o di una ricorrenza) ---
  async function postInsertValues(v: { data: string; cosa: string; importo: string; anticipa: "fausto" | "al" }) {
    const res = await fetch("/api/sheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: v.data, cosa: v.cosa, altro: "", importo: v.importo, anticipatoDa: v.anticipa }),
    });
    if (res.status === 401) {
      setAuthenticated(false);
      throw new Error("Sessione Google scaduta: riconnettiti.");
    }
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || "Errore inserimento");
    }
  }

  const postInsert = (item: OpenItem) =>
    postInsertValues({
      data: formatDate(item.tx.dataValuta),
      cosa: item.cls.categoria,
      importo: toSheetAmount(item.tx.importo),
      anticipa: "fausto",
    });

  const runInsert = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setSheetData(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
    } finally {
      setBusy(false);
    }
  };

  const insertOne = (item: OpenItem) => runInsert(() => postInsert(item));
  const insertAllAuto = () => runInsert(async () => {
    for (const item of autos) await postInsert(item);
  });
  const insertPeriodAuto = (items: OpenItem[]) => runInsert(async () => {
    for (const item of items) await postInsert(item);
  });
  const insertRecurrence = (o: Occorrenza) => runInsert(() =>
    postInsertValues({
      data: formatDate(o.dateStr),
      cosa: o.rec.categoria,
      importo: toSheetAmount(o.importo),
      anticipa: o.rec.anticipa,
    })
  );

  // --- Crea / modifica regola ---
  const openCreateRuleFromTx = (tx: Transaction) => {
    setRuleModal({
      isNew: true,
      keywords: suggestKeyword(tx.descrizione),
      categoria: "",
      stato: "AUTO",
    });
  };

  const openEdit = (ruleId: string) => {
    const r = ruleSet?.rules.find((x) => x.id === ruleId);
    if (!r) return;
    setRuleModal({
      isNew: false,
      id: r.id,
      keywords: r.keywords.join(", "),
      categoria: r.categoria === "—" ? "" : r.categoria,
      stato: r.stato,
    });
  };

  const saveRuleModal = async () => {
    if (!ruleModal) return;
    const kw = ruleModal.keywords.split(",").map((s) => s.trim()).filter(Boolean);
    if (kw.length === 0) return setError("Inserisci almeno una parola chiave.");
    if (ruleModal.stato === "AUTO" && !ruleModal.categoria) return setError("Scegli una categoria.");
    setBusy(true);
    setError(null);
    try {
      let res;
      if (ruleModal.isNew) {
        res = await fetch("/api/rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            keywords: kw,
            categoria: ruleModal.categoria,
            stato: ruleModal.stato,
          }),
        });
      } else {
        res = await fetch("/api/rules", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: ruleModal.id,
            keywords: kw,
            categoria: ruleModal.categoria,
            stato: ruleModal.stato,
          }),
        });
      }
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Errore durante il salvataggio della regola");
      }
      setRuleSet(await res.json());
      setRuleModal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
    } finally {
      setBusy(false);
    }
  };



  const deleteRule = async (ruleId: string) => {
    if (!confirm(`Sei sicuro di voler eliminare la regola ${ruleId}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rules?id=${ruleId}`, { method: "DELETE" });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Errore durante l'eliminazione della regola");
      }
      setRuleSet(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
    } finally {
      setBusy(false);
    }
  };

  const MONTH_NAMES = [
    "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
    "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"
  ];

  const getPeriodLabelFromKey = (key: string) => {
    const parts = key.split("-");
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    const d = Number(parts[2]);
    const end = new Date(y, m - 1, d);
    const start = new Date(y, m - 2, 24);
    const fmt = (dt: Date) => `${dt.getDate()} ${MONTH_NAMES[dt.getMonth()]} ${dt.getFullYear()}`;
    return `dal ${fmt(start)} al ${fmt(end)}`;
  };

  const reopenPeriod = async (periodKey: string) => {
    const label = getPeriodLabelFromKey(periodKey);
    if (!confirm(`Sei sicuro di voler riaprire il periodo ${label}? Tutte le transazioni di questo periodo nel foglio torneranno in stato 'Da Saldare'.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sheets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reopen", periodKey }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Errore durante la riapertura del periodo");
      }
      setSheetData(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
    } finally {
      setBusy(false);
    }
  };

  const togglePeriod = (key: string) => {
    setExpandedPeriods((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleIgnoreTransaction = async (tx: Transaction, ignored: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/transactions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: txId(tx), ignored }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Errore durante l'aggiornamento della transazione");
      }
      const data = await res.json();
      if (data.transactions) setTransactions(data.transactions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
    } finally {
      setBusy(false);
    }
  };

  const statoBadge = (s: Stato) =>
    s === "AUTO"
      ? "text-green-700 bg-green-50"
      : s === "ESCLUSA"
        ? "text-gray-500 bg-gray-100"
        : "text-amber-700 bg-amber-50";

  const renderAutoRow = (item: OpenItem) => (
    <div key={txId(item.tx)} className="flex items-center gap-3 px-4 py-3 border-t border-gray-50">
      <div className="w-5 h-5 flex items-center justify-center shrink-0">
        <span className="w-2 h-2 rounded-full bg-green-600" />
      </div>
      <span className="w-14 text-xs text-gray-500 shrink-0">{formatDate(item.tx.dataValuta).slice(0, 5)}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 truncate">{item.tx.descrizione}</div>
        <div className="text-xs text-gray-500">{item.cls.categoria} · regola {item.cls.regolaId}</div>
      </div>
      <span className="w-24 text-sm font-semibold text-gray-800 text-right shrink-0 font-mono pr-2">{formatCurrency(item.tx.importo)}</span>
      <div className="w-[290px] flex justify-end gap-2 shrink-0">
        <button onClick={() => insertOne(item)} disabled={busy} className="text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/50 rounded-lg px-3 py-1.5 hover:bg-emerald-100/80 active:scale-[0.97] transition-all duration-200 disabled:opacity-40 shrink-0 cursor-pointer shadow-3xs">
          Inserisci
        </button>
        <button onClick={() => openEdit(item.cls.regolaId)} disabled={busy} className="w-[110px] text-center text-xs font-semibold bg-gray-50 text-gray-700 border border-gray-200/80 rounded-lg py-1.5 hover:bg-gray-100 hover:text-gray-900 active:scale-[0.97] transition-all duration-200 shrink-0 cursor-pointer shadow-3xs" title={`Modifica la regola ${item.cls.regolaId}`}>
        Modifica regola
      </button>
        <button onClick={() => toggleIgnoreTransaction(item.tx, true)} disabled={busy} className="text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200/50 rounded-lg px-3 py-1.5 hover:bg-rose-100/80 hover:text-rose-800 active:scale-[0.97] transition-all duration-200 shrink-0 cursor-pointer shadow-3xs" title="Ignora questa specifica transazione">
          Ignora
        </button>
      </div>
    </div>
  );

  const renderRecRow = (o: Occorrenza) => (
    <div key={o.id} className="flex items-center gap-3 px-4 py-3 border-t border-gray-50">
      <div className="w-5 h-5 flex items-center justify-center text-sm shrink-0" title={o.rec.fonte === "contante" ? "Contante" : "Nexi"}>
        {o.rec.fonte === "contante" ? "💵" : "💳"}
      </div>
      <span className="w-14 text-xs text-gray-500 shrink-0">{formatDate(o.dateStr).slice(0, 5)}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 truncate">{o.rec.nome}</div>
        <div className="text-xs text-gray-500">
          {o.rec.categoria} · {o.rec.fonte === "contante" ? "contante" : "Nexi"} · ricorrenza {o.rec.id}
        </div>
      </div>
      <span className="w-24 text-sm font-semibold text-gray-800 text-right shrink-0 font-mono pr-2">{formatCurrency(-o.importo)}</span>
      <div className="w-[290px] flex justify-end gap-2 shrink-0">
        <button onClick={() => insertRecurrence(o)} disabled={busy} className="text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/50 rounded-lg px-3 py-1.5 hover:bg-blue-100/80 active:scale-[0.97] transition-all duration-200 disabled:opacity-40 shrink-0 cursor-pointer shadow-3xs">
          Inserisci
        </button>
      </div>
    </div>
  );

  const renderDadeRow = (item: OpenItem) => (
    <div key={txId(item.tx)} className="flex items-center gap-3 px-4 py-3 border-t border-gray-50 bg-amber-50/10">
      <div className="w-5 h-5 flex items-center justify-center shrink-0">
        <span className="w-2 h-2 rounded-full bg-amber-500" />
      </div>
      <span className="w-14 text-xs text-gray-500 shrink-0">{formatDate(item.tx.dataValuta).slice(0, 5)}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 truncate">{item.tx.descrizione}</div>
        <div className="text-xs text-gray-500">
          {item.cls.regolaId === "—" ? "negozio mai visto" : `regola ${item.cls.regolaId}: lascia decidere a te`}
        </div>
      </div>
      <span className="w-24 text-sm font-semibold text-gray-800 text-right shrink-0 font-mono pr-2">{formatCurrency(item.tx.importo)}</span>
      <div className="w-[290px] flex justify-end gap-2 shrink-0">
        <button onClick={() => openCreateRuleFromTx(item.tx)} disabled={busy} className="w-[110px] text-center text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/50 rounded-lg py-1.5 hover:bg-amber-100/80 active:scale-[0.97] transition-all duration-200 disabled:opacity-40 shrink-0 cursor-pointer shadow-3xs">
          Crea regola
        </button>
        <button onClick={() => toggleIgnoreTransaction(item.tx, true)} disabled={busy} className="text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200/50 rounded-lg px-3 py-1.5 hover:bg-rose-100/80 hover:text-rose-800 active:scale-[0.97] transition-all duration-200 shrink-0 cursor-pointer shadow-3xs" title="Ignora questa specifica transazione">
          Ignora
        </button>
      </div>
    </div>
  );

  const renderExclRow = (item: OpenItem) => (
    <div key={txId(item.tx)} className="flex items-center gap-3 px-4 py-3 border-t border-gray-50 bg-gray-50/30">
      <div className="w-5 h-5 flex items-center justify-center shrink-0">
        <span className="w-2 h-2 rounded-full bg-gray-400" />
      </div>
      <span className="w-14 text-xs text-gray-500 shrink-0">{formatDate(item.tx.dataValuta).slice(0, 5)}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-700 line-through truncate">{item.tx.descrizione}</div>
        <div className="text-xs text-gray-500">
          {item.cls.regolaId === "MANUALE" ? "Ignorato manualmente" : `Esclusa da regola ${item.cls.regolaId}`}
        </div>
      </div>
      <span className="w-24 text-sm font-semibold text-gray-600 text-right shrink-0 font-mono pr-2">{formatCurrency(item.tx.importo)}</span>
      <div className="w-[290px] flex justify-end gap-2 shrink-0">
        {item.cls.regolaId === "MANUALE" && (
          <button onClick={() => toggleIgnoreTransaction(item.tx, false)} disabled={busy} className="text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/50 rounded-lg px-3 py-1.5 hover:bg-blue-100/80 active:scale-[0.97] transition-all duration-200 cursor-pointer shadow-3xs">
            Ripristina
          </button>
        )}
      </div>
    </div>
  );

  const renderDoneRow = (item: OpenItem) => (
    <div key={txId(item.tx)} className="flex items-center gap-3 px-4 py-3 border-t border-gray-50 bg-emerald-50/10">
      <div className="w-5 h-5 flex items-center justify-center text-emerald-600 shrink-0 font-bold text-sm" title="Già nel foglio">
        ✓
      </div>
      <span className="w-14 text-xs text-gray-500 shrink-0">{formatDate(item.tx.dataValuta).slice(0, 5)}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-700 line-through truncate">{item.tx.descrizione}</div>
        <div className="text-xs text-gray-500">
          Già nel foglio · {item.cls.categoria} · regola {item.cls.regolaId}
        </div>
      </div>
      <span className="w-24 text-sm font-semibold text-gray-600 text-right shrink-0 font-mono pr-2">{formatCurrency(item.tx.importo)}</span>
      <div className="w-[290px] flex justify-end gap-2 shrink-0">
        <span className="text-xs font-semibold bg-emerald-50/50 text-emerald-700 border border-emerald-200/40 rounded-lg px-3 py-1.5 shadow-3xs cursor-default">
          Registrato
        </span>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-lg text-gray-500">Caricamento...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Spese da sistemare</h1>
          <p className="text-sm text-gray-500">
            periodi 24→23 · regole v{ruleSet?.baseVersion ?? "…"} rev {ruleSet?.revision ?? "…"} · ricorrenze v{recSet?.version ?? "…"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowSheetFrame((v) => !v)} className="text-sm font-medium bg-white border border-gray-200 rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-50 hover:border-gray-300 hover:shadow-2xs active:scale-[0.98] transition-all duration-200 cursor-pointer shadow-3xs">
            📊 Foglio Spese {showSheetFrame ? "▾" : "▸"}
          </button>
          <button onClick={() => setShowRules((v) => !v)} className="text-sm font-medium bg-white border border-gray-200 rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-50 hover:border-gray-300 hover:shadow-2xs active:scale-[0.98] transition-all duration-200 cursor-pointer shadow-3xs">
            📖 Regole ({ruleSet?.rules.length ?? 0})
          </button>
          <label className="cursor-pointer text-sm font-medium bg-white border border-gray-200 rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-50 hover:border-gray-300 hover:shadow-2xs active:scale-[0.98] transition-all duration-200 shadow-3xs">
            ⬆ Carica estratto
            <input type="file" accept=".csv" onChange={onUpload} className="hidden" />
          </label>
          <button onClick={insertAllAuto} disabled={busy || autos.length === 0} className="text-sm font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg px-4 py-2 hover:from-emerald-700 hover:to-teal-700 hover:shadow-md active:scale-[0.98] transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none shadow-sm cursor-pointer">
            {busy ? "Invio..." : `Inserisci le ${autos.length} automatiche`}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-2">{error}</div>
      )}

      {/* Visualizzatore Foglio Google */}
      {showSheetFrame && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-5">
          <div className="px-4 py-3 text-sm font-semibold text-gray-700 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <span>Foglio Spese Inserite (Google Sheet)</span>
            <a
              href={`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=${CONTI_SHEET_ID}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-medium"
            >
              Apri in una nuova scheda ↗
            </a>
          </div>
          <div className="w-full h-[600px] border-0 bg-white">
            <iframe
              src={`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit?rm=minimal#gid=${CONTI_SHEET_ID}`}
              className="w-full h-full"
              allowFullScreen
              loading="lazy"
            />
          </div>
        </div>
      )}

      {/* Visualizzatore regole */}
      {showRules && ruleSet && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-5">
          <div className="px-4 py-2 text-xs font-semibold text-gray-600 bg-gray-50 border-b border-gray-100">
            Regole di decisione — v{ruleSet.baseVersion} · rev {ruleSet.revision} · ordine = priorità (la prima che combacia vince)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 bg-gray-50/50">
                  <th className="px-4 py-2 font-medium">ID</th>
                  <th className="px-4 py-2 font-medium">Se la descrizione contiene…</th>
                  <th className="px-4 py-2 font-medium">→ Categoria</th>
                  <th className="px-4 py-2 font-medium">Esito</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {ruleSet.rules.map((r) => (
                  <tr key={r.id} className="border-t border-gray-50">
                    <td className="px-4 py-2 text-gray-400 font-mono text-xs whitespace-nowrap">{r.id}</td>
                    <td className="px-4 py-2 text-gray-700">{r.keywords.join(", ")}</td>
                    <td className="px-4 py-2 text-gray-700">{r.categoria}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs font-medium rounded px-2 py-0.5 ${statoBadge(r.stato)}`}>
                        {r.stato === "AUTO" ? "AUTO" : r.stato === "ESCLUSA" ? "ESCLUDI" : "DA DECIDERE"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap space-x-2">
                      <button onClick={() => openEdit(r.id)} className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer">Modifica</button>
                      <button onClick={() => deleteRule(r.id)} className="text-xs font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer">Elimina</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Non autenticato */}
      {authenticated === false && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-gray-600 mb-4">Connetti il tuo account Google per leggere e aggiornare il foglio.</p>
          <a href="/api/auth/google" className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
            Connetti Google Account
          </a>
        </div>
      )}

      {authenticated && !ready && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-gray-500">Caricamento…</div>
      )}

      {authenticated && ready && (
        <>
          {/* Riepilogo */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600 bg-white border border-gray-100 rounded-xl px-4 py-3 mb-4 shadow-sm">
            <span><b className="text-green-700">{autos.length + totalRecs}</b> da inserire</span>
            <span><b className="text-amber-600">{daDecidere.length}</b> da decidere</span>
            <span><b className="text-gray-500">{alreadyCount}</b> già nel foglio</span>
            <span className="ml-auto text-gray-400">{excluded.length} escluse · {closedPeriods.size} periodi chiusi</span>
          </div>

          {/* Sezione Conflitti / Sovrapposizioni */}
          {conflicts && conflicts.length > 0 && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">⚠️</span>
                <h3 className="text-base font-semibold text-red-800">
                  Sovrapposizione Regole Rilevata ({conflicts.length})
                </h3>
              </div>
              <p className="text-sm text-red-700 mb-4">
                Le seguenti transazioni corrispondono a più di una regola contemporaneamente. 
                Modifica le parole chiave delle regole indicate per rimuovere l&apos;ambiguità. L&apos;inserimento di queste voci è bloccato fino alla risoluzione.
              </p>
              <div className="space-y-3">
                {conflicts.map((item) => (
                  <div key={txId(item.tx)} className="bg-white border border-red-100 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-800">{item.tx.descrizione}</div>
                      <div className="text-xs text-red-500 mt-1 flex items-center gap-1.5 flex-wrap">
                        <span>Corrisponde alle regole:</span>
                        {item.allMatches.map((id) => (
                          <span key={id} className="font-mono bg-red-50 px-1.5 py-0.5 rounded text-red-700 border border-red-100 text-xs font-semibold">{id}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {item.allMatches.map((ruleId) => (
                        <button
                          key={ruleId}
                          onClick={() => openEdit(ruleId)}
                          className="text-xs font-bold bg-rose-50 text-rose-700 hover:bg-rose-100/80 hover:text-rose-800 border border-rose-200/50 rounded-lg px-3 py-1.5 active:scale-[0.97] transition-all cursor-pointer shadow-3xs"
                        >
                          Modifica {ruleId}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Periodi aperti */}
          {periods.map((p) => {
            const entries = [
              ...p.autos.map((it) => ({ kind: "auto" as const, item: it, occurrence: null, k: toSortKey(it.tx.dataValuta) })),
              ...p.recs.map((o) => ({ kind: "rec" as const, item: null, occurrence: o, k: toSortKey(o.dateStr) })),
              ...p.dade.map((it) => ({ kind: "dade" as const, item: it, occurrence: null, k: toSortKey(it.tx.dataValuta) })),
              ...p.excl.map((it) => ({ kind: "excl" as const, item: it, occurrence: null, k: toSortKey(it.tx.dataValuta) })),
              ...p.done.map((it) => ({ kind: "done" as const, item: it, occurrence: null, k: toSortKey(it.tx.dataValuta) })),
            ].sort((a, b) => a.k.localeCompare(b.k));

            const isCollapsed = !expandedPeriods[p.key];

            return (
              <div key={p.key} className="mb-6">
                <div
                  onClick={() => togglePeriod(p.key)}
                  className="flex items-center justify-between gap-2 mb-2 bg-white/60 hover:bg-white border border-gray-100 shadow-xs rounded-xl px-4 py-3 cursor-pointer select-none transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 font-bold text-xs select-none">
                      {isCollapsed ? "▶" : "▼"}
                    </span>
                    <h2 className="text-base font-semibold text-gray-800">{p.label}</h2>
                    <span className="text-xs font-medium text-gray-500 bg-gray-100/80 px-2 py-0.5 rounded-full">
                      {entries.length} {entries.length === 1 ? "voce" : "voci"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {p.autos.length > 0 && (
                      <button onClick={() => insertPeriodAuto(p.autos)} disabled={busy} className="text-xs font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg px-3 py-1.5 hover:from-emerald-700 hover:to-teal-700 hover:shadow-sm active:scale-[0.97] transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none shadow-3xs cursor-pointer">
                        {busy ? "Invio..." : `Inserisci ${p.autos.length} automatiche`}
                      </button>
                    )}
                  </div>
                </div>

                {!isCollapsed && (
                  <>
                    {entries.length > 0 ? (
                      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-3">
                        {entries.map((e) => {
                          if (e.kind === "auto" && e.item) return renderAutoRow(e.item);
                          if (e.kind === "rec" && e.occurrence) return renderRecRow(e.occurrence);
                          if (e.kind === "dade" && e.item) return renderDadeRow(e.item);
                          if (e.kind === "excl" && e.item) return renderExclRow(e.item);
                          if (e.kind === "done" && e.item) return renderDoneRow(e.item);
                          return null;
                        })}
                      </div>
                    ) : (
                      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center text-gray-400 text-sm mb-3">
                        Nessun movimento in sospeso in questo periodo.
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}

          {periods.length === 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-gray-500">
              Tutto sistemato 🎉 — nessuna spesa in sospeso nei periodi aperti.
            </div>
          )}

          {/* Periodi chiusi */}
          {(() => {
            const displayClosed = Array.from(closedPeriods)
              .filter((key) => key >= "2025-03-23")
              .sort((a, b) => b.localeCompare(a));

            return (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Periodi chiusi e riconciliati ({displayClosed.length})
                </h3>
                {displayClosed.length === 0 ? (
                  <p className="text-xs text-gray-400">Nessun periodo chiuso recente.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {displayClosed.map((key) => {
                      const label = getPeriodLabelFromKey(key);
                      return (
                        <div
                          key={key}
                          className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-xs text-gray-600 font-medium"
                        >
                          <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" title="Chiuso e Saldato" />
                          <span className="truncate">{label}</span>
                          <button
                            onClick={() => reopenPeriod(key)}
                            disabled={busy}
                            className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg px-2.5 py-1.5 disabled:opacity-40 transition-all cursor-pointer"
                          >
                            Riapri
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ESCLUSE */}
          <button onClick={() => setShowExcluded((v) => !v)} className="text-xs text-gray-500 hover:text-gray-700 mb-2 hover:bg-gray-100 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer">
            {showExcluded ? "▾" : "▸"} {excluded.length} voci escluse da una regola
          </button>
          {showExcluded && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-4">
              {excluded.map((item) => (
                <div key={txId(item.tx)} className="flex items-center gap-3 px-4 py-2 border-t border-gray-50 text-xs text-gray-500">
                  <span className="w-14 shrink-0 text-gray-500">{formatDate(item.tx.dataValuta).slice(0, 5)}</span>
                  <span className="flex-1 truncate text-gray-700">{item.tx.descrizione}</span>
                  <span className="font-mono text-gray-500">{item.cls.regolaId}</span>
                  <span className="shrink-0 font-medium text-gray-600">{formatCurrency(item.tx.importo)}</span>
                  {item.cls.regolaId === "MANUALE" && (
                    <button
                      onClick={() => toggleIgnoreTransaction(item.tx, false)}
                      disabled={busy}
                      className="text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/50 rounded-lg px-3 py-1.5 hover:bg-blue-100/80 active:scale-[0.97] transition-all duration-200 disabled:opacity-40 ml-2 cursor-pointer shadow-3xs"
                    >
                      Ripristina
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Editor/Creatore regola (modale) */}
      {ruleModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setRuleModal(null)}>
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {ruleModal.isNew ? "Crea nuova regola" : "Modifica regola"}
            </h3>
            {!ruleModal.isNew && (
              <p className="text-xs text-gray-400 mb-4 font-mono">{ruleModal.id}</p>
            )}

            <label className="block text-sm font-medium text-gray-700 mb-1">Parole chiave (separate da virgola)</label>
            <input value={ruleModal.keywords} onChange={(e) => setRuleModal({ ...ruleModal, keywords: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 mb-3" />

            <label className="block text-sm font-medium text-gray-700 mb-1">Esito</label>
            <select value={ruleModal.stato} onChange={(e) => setRuleModal({ ...ruleModal, stato: e.target.value as Stato })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 mb-3 bg-white">
              <option value="AUTO">AUTO — inserisci con categoria</option>
              <option value="DA_DECIDERE">DA DECIDERE — lascia decidere a me</option>
              <option value="ESCLUSA">ESCLUDI — non va sul foglio</option>
            </select>

            {ruleModal.stato !== "ESCLUSA" && (
              <>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                <select value={ruleModal.categoria} onChange={(e) => setRuleModal({ ...ruleModal, categoria: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 mb-3 bg-white">
                  <option value="">Categoria…</option>
                  {CATEGORIE.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </>
            )}

            <div className="flex gap-3 mt-3">
              <button onClick={() => setRuleModal(null)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 hover:shadow-2xs active:scale-[0.98] transition-all cursor-pointer">Annulla</button>
              <button onClick={saveRuleModal} disabled={busy} className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg text-sm font-semibold hover:from-blue-700 hover:to-indigo-700 hover:shadow-sm active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer">
                {busy ? "Salvo..." : "Salva regola"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer trasparenza */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 mt-6">
        <span>regole v{ruleSet?.baseVersion ?? "…"} rev {ruleSet?.revision ?? "…"} · ricorrenze v{recSet?.version ?? "…"}</span>
        <span>·</span>
        <span>ogni inserimento è l&apos;applicazione di una regola o ricorrenza</span>
        <span>·</span>
        <span>{archive ? `originale archiviato: ${archive.name}` : "originale archiviato all'upload"}</span>
      </div>
    </div>
  );
}
