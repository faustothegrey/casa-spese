import { NextRequest, NextResponse } from "next/server";
import { isBackend, runningPort } from "@/lib/consulente/manager";
import { cleanMessages, type RawMessage } from "@/lib/consulente/clean";

// Restituisce la conversazione (pulita) e lo stato dell'agente. NON avvia l'istanza:
// se l'agente non è in esecuzione torna lista vuota e status "off" (usato per il polling).
export async function GET(req: NextRequest) {
  const backend = req.nextUrl.searchParams.get("backend");
  if (!isBackend(backend)) return NextResponse.json({ messages: [], status: "off" });

  const port = runningPort(backend);
  if (!port) return NextResponse.json({ messages: [], status: "off" });

  try {
    const [mr, sr] = await Promise.all([
      fetch(`http://127.0.0.1:${port}/messages`),
      fetch(`http://127.0.0.1:${port}/status`),
    ]);
    const mj = (await mr.json()) as { messages?: RawMessage[] };
    const sj = (await sr.json()) as { status?: string };
    return NextResponse.json({
      messages: cleanMessages(mj.messages ?? []),
      status: sj.status ?? "unknown",
    });
  } catch {
    // agentapi in avvio o non raggiungibile: il client riproverà
    return NextResponse.json({ messages: [], status: "starting" });
  }
}
