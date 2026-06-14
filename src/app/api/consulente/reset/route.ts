import { NextRequest, NextResponse } from "next/server";
import { isBackend, stop } from "@/lib/consulente/manager";

// Termina l'istanza agentapi del backend: la prossima conversazione riparte pulita.
export async function POST(req: NextRequest) {
  let body: { backend?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON non valido" }, { status: 400 });
  }
  if (!isBackend(body.backend)) return NextResponse.json({ error: "backend non valido" }, { status: 400 });
  stop(body.backend);
  return NextResponse.json({ ok: true });
}
