import { NextRequest, NextResponse } from "next/server";
import { ensureRunning, isBackend, isContextSent, markContextSent } from "@/lib/consulente/manager";
import { buildContext, CONTEXT_MARKER } from "@/lib/consulente/context";

// Invia un messaggio dell'utente all'agente selezionato (avviando agentapi se serve).
// Al primo turno antepone il preambolo di contesto (patrimonio + note del Vault).
export async function POST(req: NextRequest) {
  let body: { backend?: unknown; content?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON non valido" }, { status: 400 });
  }
  const { backend, content } = body;
  if (!isBackend(backend)) return NextResponse.json({ error: "backend non valido" }, { status: 400 });
  if (typeof content !== "string" || !content.trim())
    return NextResponse.json({ error: "messaggio vuoto" }, { status: 400 });

  try {
    const port = await ensureRunning(backend);
    let text = content;
    if (!isContextSent(backend)) {
      text = `${buildContext()}\n\n---\n\n${CONTEXT_MARKER}\n${content}`;
    }
    const r = await fetch(`http://127.0.0.1:${port}/message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: text, type: "user" }),
    });
    if (!r.ok) throw new Error(`agentapi /message ha risposto ${r.status}`);
    if (!isContextSent(backend)) markContextSent(backend);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "errore interno" },
      { status: 500 }
    );
  }
}
