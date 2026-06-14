// Motore di regole DETERMINISTICO per la categorizzazione delle spese.
// Stesso input + stesse regole => stesso risultato. Nessun ML: solo regole esplicite.
// Le regole vivono in un file versionato (data/rules.json, vedi lib/rules-store.ts):
// SEED_RULES qui sotto è solo il contenuto iniziale.

export const RULES_VERSION = "2026.06";

export type Stato = "AUTO" | "DA_DECIDERE" | "ESCLUSA";

export interface Rule {
  id: string;
  keywords: string[]; // match case-insensitive sulla descrizione
  categoria: string;
  stato: Stato;
  nota?: string;
}

export interface Classificazione {
  categoria: string;
  stato: Stato;
  regolaId: string;
}

// L'ORDINE conta: la prima regola che matcha vince.
// Le regole aggiunte dall'utente vengono messe PRIMA di queste (vedi rules-store).
export const SEED_RULES: Rule[] = [
  // --- ESCLUSIONI: non vanno mai sul foglio ---
  {
    id: "X-01",
    keywords: [
      "COMMISSIONI",
      "BOLLI",
      "IMPOSTA DI BOLLO",
      "CANONE",
      "PRELIEVO",
      "PRELEV",
      "ACCR. STIPENDI",
      "COMPETENZE",
      "ACC.TD",
      "NEG. OP.TITOLI",
      "CEDOL",
      "GIROCONTO",
      "ESTINZIONE CONTO",
      "POS CARTE CREDITO",
      "UNICOOP SOVIGLIANA",
      "UNICOOP EMPOLI",
      "UNICOOP PONTEDERA",
      "COOP LA RISORTA",
      "COOP \"LA RISORTA\"",
      "COOP ITALIA UNICOOP TI",
      "UNICOOP FIRENZE        CASTELFRANCO"
    ],
    categoria: "—",
    stato: "ESCLUSA"
  },

  // --- AFFITTO (importo variabile per lo split: da verificare) ---
  {
    id: "R-001",
    keywords: ["Imp.1.050,00"],
    categoria: "Affitto",
    stato: "DA_DECIDERE"
  },

  // --- ALIMENTARI: supermercati ed esercizi alimentari ---
  {
    id: "R-017",
    keywords: [
      "CONAD",
      "EUROSPIN",
      "ESSELUNGA",
      "FAMILA",
      "PAM ",
      "PANORAMA",
      "CARREFOUR",
      "LIDL",
      "PENNY",
      "SUPERSTORE",
      "DMS GROUP",
      "TODIS",
      "SIGMA",
      "CRAI",
      "UNICOOP FIRENZE - PISA",
      "MACELLERIA",
      "PANIFICIO",
      "FORNO",
      "GASTRONOMIA",
      "ENOTECA",
      "ORTOFRUTTA",
      "FRUTTA",
      "TENTAZIONI",
      "ANGELICA",
      "FOODERIA"
    ],
    categoria: "Spese alimentari",
    stato: "AUTO"
  },

  // --- RISTORAZIONE (spesso condivisa, ma da confermare) ---
  {
    id: "R-019",
    keywords: [
      "RISTORANTE",
      "PIZZ",
      "TRATTORIA",
      "OSTERIA",
      "BAR ",
      "CAFE",
      "CAFFE",
      "GELAT",
      "HANGAR",
      "STRAPIZZAMI",
      "AUTOGRILL",
      "LIDO",
      "STABILIMENTO",
      "NECCIO"
    ],
    categoria: "Spese alimentari",
    stato: "DA_DECIDERE"
  },

  // --- AUTO / TRASPORTI / LAVANDERIA ---
  {
    id: "R-031",
    keywords: [
      "CDT TRATTA",
      "AUTOSTRAD",
      "TELEPASS",
      "PEDAGGI",
      "ALA ",
      "METANO",
      "BEYFIN",
      "ENI ",
      "TAMOIL",
      "ESSO",
      "AGIP",
      "CARBURANT",
      "BENZINA",
      "DISTRIBUTORE",
      "LAVANDERIA"
    ],
    categoria: "Altro",
    stato: "AUTO"
  },

  // --- UTENZE: Luce ---
  {
    id: "R-041",
    keywords: ["ENEL", "SERVIZIO ELETTRICO", "LUCE", "ACEA", "A2A"],
    categoria: "Luce",
    stato: "DA_DECIDERE"
  },

  // --- UTENZE: Gas ---
  {
    id: "R-042",
    keywords: ["GAS", "ENGIE", "EDISON"],
    categoria: "Gas",
    stato: "DA_DECIDERE"
  },

  // --- UTENZE: Acqua ---
  {
    id: "R-043",
    keywords: ["ACQUA", "GEAL", "ACQUEDOTTO", "PUBLIACQUA", "ASA "],
    categoria: "Acqua",
    stato: "DA_DECIDERE"
  },

  // --- UTENZE: Internet ---
  {
    id: "R-045",
    keywords: ["INTERNET", "FASTWEB", "VODAFONE", "WIND", "ILIAD", "TISCALI"],
    categoria: "Internet",
    stato: "DA_DECIDERE"
  },

  // --- CASA / BRICOLAGE / FARMACIA ---
  {
    id: "R-051",
    keywords: [
      "BRICOMAN",
      "LEROY",
      "IKEA",
      "BRICO",
      "FERRAMENTA",
      "ECO CLIMA",
      "FARMACIA",
      "PARAFARMACIA"
    ],
    categoria: "Altro",
    stato: "DA_DECIDERE"
  },
];

// Categorie selezionabili quando si crea una regola.
export const CATEGORIE = [
  "Spese alimentari",
  "Affitto",
  "Katerina",
  "Gas",
  "Luce",
  "Acqua",
  "Internet",
  "Altro",
];

// Classificazione PURA: applica un insieme di regole a una descrizione.
export function classificaWith(rules: Rule[], descrizione: string): Classificazione {
  const d = (descrizione || "").toUpperCase();
  for (const r of rules) {
    if (r.keywords.some((k) => k && d.includes(k.toUpperCase()))) {
      return { categoria: r.categoria, stato: r.stato, regolaId: r.id };
    }
  }
  // Nessuna regola: il movimento NON è inseribile finché non crei una regola.
  return { categoria: "", stato: "DA_DECIDERE", regolaId: "—" };
}

// Trova tutti gli ID delle regole che corrispondono alla descrizione
export function findMatchingRuleIds(rules: Rule[], descrizione: string): string[] {
  const d = (descrizione || "").toUpperCase();
  const matched: string[] = [];
  for (const r of rules) {
    if (r.keywords.some((k) => k && d.includes(k.toUpperCase()))) {
      matched.push(r.id);
    }
  }
  return matched;
}

// Suggerisce una parola chiave a partire dalla descrizione del movimento
// (per pre-compilare il form "crea regola").
export function suggestKeyword(descrizione: string): string {
  let s = (descrizione || "").replace(/^CARTE DI DEBITO/i, "").trim();
  s = s.replace(/\s+Carta \d+.*/i, "").replace(/\s+Data \d{2} \d{2}.*/i, "");
  s = s.replace(/\bITA\b|\bID\b/g, "");
  s = s.replace(/\s{2,}/g, " ").trim();
  return s.split(" ").slice(0, 2).join(" ").toUpperCase();
}
