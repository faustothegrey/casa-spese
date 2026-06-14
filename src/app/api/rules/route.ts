import { NextRequest, NextResponse } from "next/server";
import { ensureRulesFile, addRule, updateRule, deleteRule } from "@/lib/rules-store";
import { Stato } from "@/lib/rules";

// GET: restituisce l'insieme di regole corrente (versionato).
export async function GET() {
  const rs = ensureRulesFile();
  return NextResponse.json(rs);
}

// POST: aggiunge una nuova regola. Body: { keywords: string[], categoria, stato, nota? }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const keywords: string[] = Array.isArray(body.keywords)
      ? body.keywords
      : body.keyword
        ? [String(body.keyword)]
        : [];
    const stato = body.stato as Stato;
    const categoria = String(body.categoria || "");

    if (keywords.length === 0 || !keywords[0]?.trim()) {
      return NextResponse.json({ error: "Parola chiave mancante" }, { status: 400 });
    }
    if (stato !== "AUTO" && stato !== "ESCLUSA") {
      return NextResponse.json({ error: "Stato non valido" }, { status: 400 });
    }
    if (stato === "AUTO" && !categoria.trim()) {
      return NextResponse.json({ error: "Categoria mancante" }, { status: 400 });
    }

    const rs = addRule({ keywords, categoria, stato, nota: body.nota });
    return NextResponse.json(rs);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore" },
      { status: 500 }
    );
  }
}

// PUT: modifica una regola esistente. Body: { id, keywords: string[], categoria, stato }
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const id = String(body.id || "");
    const stato = body.stato as Stato;
    const categoria = String(body.categoria || "");
    const keywords: string[] = Array.isArray(body.keywords) ? body.keywords : [];

    if (!id) {
      return NextResponse.json({ error: "ID regola mancante" }, { status: 400 });
    }
    if (!["AUTO", "ESCLUSA", "DA_DECIDERE"].includes(stato)) {
      return NextResponse.json({ error: "Stato non valido" }, { status: 400 });
    }
    if (keywords.length === 0 || !keywords[0]?.trim()) {
      return NextResponse.json({ error: "Parola chiave mancante" }, { status: 400 });
    }
    if (stato === "AUTO" && !categoria.trim()) {
      return NextResponse.json({ error: "Categoria mancante" }, { status: 400 });
    }

    const rs = updateRule(id, { keywords, categoria, stato });
    return NextResponse.json(rs);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore" },
      { status: 500 }
    );
  }
}

// DELETE: elimina una regola esistente. Query param: ?id=regolaId
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "ID regola mancante" }, { status: 400 });
    }
    const rs = deleteRule(id);
    return NextResponse.json(rs);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore" },
      { status: 500 }
    );
  }
}
