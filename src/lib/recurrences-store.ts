// Persistenza delle ricorrenze (server-only). File: data/recurrences.json (versionabile).

import fs from "fs";
import path from "path";
import { SEED_RECURRENCES, RECUR_VERSION, Recurrence } from "./recurrences";

const PATH = path.join(process.cwd(), "data", "recurrences.json");

export interface RecurrenceSet {
  version: string;
  revision: number;
  updatedAt: string;
  recurrences: Recurrence[];
}

function seed(): RecurrenceSet {
  return {
    version: RECUR_VERSION,
    revision: 0,
    updatedAt: new Date().toISOString(),
    recurrences: SEED_RECURRENCES,
  };
}

export function loadRecurrences(): RecurrenceSet {
  try {
    return JSON.parse(fs.readFileSync(PATH, "utf-8")) as RecurrenceSet;
  } catch {
    return seed();
  }
}

export function saveRecurrences(rs: RecurrenceSet): void {
  fs.mkdirSync(path.dirname(PATH), { recursive: true });
  fs.writeFileSync(PATH, JSON.stringify(rs, null, 2), "utf-8");
}

export function ensureRecurrencesFile(): RecurrenceSet {
  if (!fs.existsSync(PATH)) {
    const rs = seed();
    saveRecurrences(rs);
    return rs;
  }
  return loadRecurrences();
}
