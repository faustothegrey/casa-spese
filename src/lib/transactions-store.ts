import fs from "fs";
import path from "path";
import { Transaction, parseCSV, txId } from "./transactions";

const TRANSACTIONS_PATH = path.join(process.cwd(), "data", "transactions.json");
const SEED_CSV_PATH = path.join(process.cwd(), "public", "movimenti.csv");

export function loadTransactions(): Transaction[] {
  try {
    if (fs.existsSync(TRANSACTIONS_PATH)) {
      const raw = fs.readFileSync(TRANSACTIONS_PATH, "utf-8");
      return JSON.parse(raw) as Transaction[];
    }
  } catch (err) {
    console.error("Error reading transactions.json:", err);
  }

  // Seed from movimenti.csv if it exists
  try {
    if (fs.existsSync(SEED_CSV_PATH)) {
      const csvText = fs.readFileSync(SEED_CSV_PATH, "utf-8");
      const parsed = parseCSV(csvText);
      saveTransactions(parsed);
      return parsed;
    }
  } catch (err) {
    console.error("Error seeding transactions from CSV:", err);
  }

  return [];
}

export function saveTransactions(txs: Transaction[]): void {
  try {
    fs.mkdirSync(path.dirname(TRANSACTIONS_PATH), { recursive: true });
    fs.writeFileSync(TRANSACTIONS_PATH, JSON.stringify(txs, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing transactions.json:", err);
  }
}

export function addTransactions(newTxs: Transaction[]): Transaction[] {
  const existing = loadTransactions();
  const map = new Map<string, Transaction>();
  
  // Load existing transactions into the map
  for (const t of existing) {
    map.set(txId(t), t);
  }
  
  // Merge new transactions, preserving custom fields like 'ignored'
  for (const t of newTxs) {
    const key = txId(t);
    const prev = map.get(key);
    if (prev) {
      map.set(key, {
        ...t,
        ignored: prev.ignored,
      });
    } else {
      map.set(key, t);
    }
  }
  
  const merged = Array.from(map.values());
  
  // Sort chronologically (newest first) by dataValuta
  const toTime = (dateStr: string) => {
    if (!dateStr) return 0;
    const parts = dateStr.split("-").map(Number);
    if (parts.length < 3) return 0;
    return new Date(parts[2], parts[1] - 1, parts[0]).getTime();
  };
  
  merged.sort((a, b) => toTime(b.dataValuta) - toTime(a.dataValuta));
  
  saveTransactions(merged);
  return merged;
}
