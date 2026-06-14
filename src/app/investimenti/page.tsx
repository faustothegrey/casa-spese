import {
  SEED_HOLDINGS,
  ASSET_CLASS_LABEL,
  MARKET,
  totalePatrimonio,
  allocazione,
  rendimentoNetto,
  rendimentoRealeNetto,
  flussiFuturi,
  cedoleProssimi12Mesi,
} from "@/lib/portfolio";
import { formatCurrency } from "@/lib/transactions";

// Data di riferimento per il calendario flussi (allineata allo snapshot di sessione).
const OGGI = "2026-06-14";

function pct(n: number, segno = false): string {
  const s = n.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  return `${segno && n > 0 ? "+" : ""}${s}%`;
}

// Analisi investimenti: patrimonio, allocazione, rendimento reale netto vs inflazione,
// contesto di mercato e calendario delle cedole/scadenze. Dati da src/lib/portfolio.
export default function InvestimentiPage() {
  const holdings = SEED_HOLDINGS;
  const totale = totalePatrimonio(holdings);
  const alloc = allocazione(holdings);
  const plTotale = holdings.reduce((s, h) => s + (h.plLatente ?? 0), 0);
  const flussi = flussiFuturi(holdings, OGGI);
  // Cumulato netto progressivo (precalcolato per non mutare variabili durante il render).
  const cumulati = flussi.map((_, i) =>
    flussi.slice(0, i + 1).reduce((s, f) => s + f.netto, 0)
  );
  const reddito12m = cedoleProssimi12Mesi(holdings, OGGI);

  const barColor: Record<string, string> = {
    liquidita: "bg-sky-400",
    titoli_stato: "bg-indigo-400",
    deposito_vincolato: "bg-emerald-400",
  };

  // Colore/giudizio sul rendimento reale netto.
  const giudizio = (reale: number) =>
    reale >= 0
      ? { txt: "in linea / sopra", cls: "text-emerald-600" }
      : reale > -1
        ? { txt: "poco sotto", cls: "text-amber-600" }
        : { txt: "erosione", cls: "text-rose-600" };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Analisi investimenti</h1>
        <p className="text-sm text-gray-500">
          snapshot patrimonio · al 13/06/2026 · escluso il conto della madre
        </p>
      </div>

      {/* Cards riassuntive */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Patrimonio totale</p>
          <p className="text-2xl font-semibold text-gray-900">{formatCurrency(totale)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Posizioni</p>
          <p className="text-2xl font-semibold text-gray-900">{holdings.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">P&amp;L latente</p>
          <p className={`text-2xl font-semibold ${plTotale >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {plTotale >= 0 ? "+" : ""}
            {formatCurrency(plTotale)}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Cedole nette 12 mesi</p>
          <p className="text-2xl font-semibold text-gray-900">{formatCurrency(reddito12m)}</p>
        </div>
      </div>

      {/* Allocazione per asset class */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Allocazione per classe</h2>
        <div className="flex flex-col gap-3">
          {alloc.map((a) => (
            <div key={a.assetClass}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-700">{ASSET_CLASS_LABEL[a.assetClass]}</span>
                <span className="text-gray-500 font-mono">
                  {formatCurrency(a.valore)} · {(a.quota * 100).toFixed(0)}%
                </span>
              </div>
              <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${barColor[a.assetClass] ?? "bg-gray-400"}`}
                  style={{ width: `${a.quota * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-4">
          100% in capitale garantito o titoli di Stato presso un&apos;unica banca — profilo molto prudente, forte concentrazione.
        </p>
      </div>

      {/* Rendimento: cedola (lordo/netto/reale) + P&L latente di capitale */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
        <div className="px-4 py-3 text-sm font-semibold text-gray-700 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
          <span>Rendimento</span>
          <span className="text-xs font-normal text-gray-500">reale netto vs inflazione {pct(MARKET.inflazione)}</span>
        </div>
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Strumento</th>
                <th className="px-4 py-3 text-right">Lordo</th>
                <th className="px-4 py-3 text-right">Netto</th>
                <th className="px-4 py-3 text-right">Reale netto</th>
                <th className="px-4 py-3 text-right">P&amp;L latente</th>
                <th className="px-4 py-3">Giudizio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {holdings.map((h) => {
                const netto = rendimentoNetto(h);
                const reale = rendimentoRealeNetto(h);
                const g = reale != null ? giudizio(reale) : null;
                return (
                  <tr key={h.id} className="hover:bg-gray-50/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{h.nome}</div>
                      <div className="text-xs text-gray-400">
                        tassazione {h.tassazione != null ? `${h.tassazione}%` : "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-600">
                      {h.rendimentoLordo != null ? pct(h.rendimentoLordo) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-600">
                      {netto != null ? pct(netto) : "—"}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-semibold ${g?.cls ?? "text-gray-400"}`}>
                      {reale != null ? pct(reale, true) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                      {h.plLatente != null ? (
                        <span className={h.plLatente >= 0 ? "text-emerald-600" : "text-rose-600"}>
                          {h.plLatente >= 0 ? "+" : ""}
                          {formatCurrency(h.plLatente)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-sm ${g?.cls ?? "text-gray-400"}`}>{g?.txt ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 px-4 py-3 border-t border-gray-50">
          Lordo/netto/reale = rendimento da cedola; il <strong>P&amp;L latente</strong> è la plus/minusvalenza di capitale non realizzata (valore di mercato − prezzo di carico). Capitale ben protetto, ma l&apos;inflazione erode il valore reale: la liquidità ferma a 0% è il punto debole maggiore. Bollo titoli/deposito ~0,20%/anno non incluso nelle %.
        </p>
      </div>

      {/* Contesto di mercato + Calendario flussi */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contesto di mercato */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Contesto di mercato</h2>
          <p className="text-xs text-gray-400 mb-4">al 13/06/2026</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-gray-500">Inflazione (Eurozona)</dt>
              <dd className="font-semibold text-rose-600">{pct(MARKET.inflazione)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">BCE sui depositi</dt>
              <dd className="font-semibold text-gray-800">{pct(MARKET.bceDeposito)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">BTP 10 anni</dt>
              <dd className="font-semibold text-gray-800">{pct(MARKET.btp10y)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Conti deposito 12m</dt>
              <dd className="font-semibold text-gray-800">
                {pct(MARKET.depositi12m[0])}–{pct(MARKET.depositi12m[1])}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">S&amp;P 500 (YTD)</dt>
              <dd className="font-semibold text-emerald-600">{pct(MARKET.spxYtd, true)}</dd>
            </div>
          </dl>
          <p className="text-xs text-gray-400 mt-4">
            Tassi in risalita e inflazione sopra il 3%: quasi nessuno strumento &quot;sicuro&quot; la batte al netto delle tasse. L&apos;azionario sale ma non è pertinente per obiettivi a breve.
          </p>
        </div>

        {/* Calendario flussi */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 text-sm font-semibold text-gray-700 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <span>Calendario flussi</span>
            <span className="text-xs font-normal text-gray-500">cedole e scadenze future</span>
          </div>
          <div className="w-full max-h-[360px] overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Strumento</th>
                  <th className="px-4 py-3 text-right">Netto</th>
                  <th className="px-4 py-3 text-right">Cumulato</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {flussi.map((f, i) => {
                  return (
                    <tr key={`${f.holdingId}-${f.data}-${i}`} className="hover:bg-gray-50/40 transition-colors">
                      <td className="px-4 py-2 text-gray-600 whitespace-nowrap">
                        {new Date(f.data).toLocaleDateString("it-IT")}
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-gray-800">{f.holdingNome}</span>
                        {f.tipo === "rimborso" && (
                          <span className="ml-2 text-[11px] font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full">
                            rimborso
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-emerald-600 whitespace-nowrap">
                        +{formatCurrency(f.netto)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-gray-500 whitespace-nowrap">
                        {formatCurrency(cumulati[i])}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Tabella titoli */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mt-6">
        <div className="px-4 py-3 text-sm font-semibold text-gray-700 bg-gray-50 border-b border-gray-100">
          Posizioni
        </div>
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Posizione</th>
                <th className="px-4 py-3">Classe</th>
                <th className="px-4 py-3 text-right">Valore</th>
                <th className="px-4 py-3 text-center">Scadenza</th>
                <th className="px-4 py-3 text-center">Garanzia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {holdings.map((h) => (
                <tr key={h.id} className="hover:bg-gray-50/40 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{h.nome}</div>
                    <div className="text-xs text-gray-400">{h.rapporto}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{ASSET_CLASS_LABEL[h.assetClass]}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-gray-800 whitespace-nowrap">
                    {formatCurrency(h.valore)}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600 whitespace-nowrap">
                    {h.scadenza ? new Date(h.scadenza).toLocaleDateString("it-IT") : "—"}
                  </td>
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    {h.garantito ? (
                      <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                        garantito
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        —
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-6">
        Dati da <code>src/lib/portfolio.ts</code> (seed dal Vault). Calendario flussi calcolato dal {new Date(OGGI).toLocaleDateString("it-IT")}.
      </p>
    </div>
  );
}
