import { NextResponse } from "next/server";
import { ensureRecurrencesFile } from "@/lib/recurrences-store";

// GET: restituisce le ricorrenze correnti (versionate).
// (Aggiunta/modifica via UI: prossima iterazione; per ora si edita data/recurrences.json.)
export async function GET() {
  const rs = ensureRecurrencesFile();
  return NextResponse.json(rs);
}
