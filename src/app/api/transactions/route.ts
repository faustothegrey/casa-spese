import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { loadTransactions, addTransactions, saveTransactions } from "@/lib/transactions-store";
import { parseCSV, txId } from "@/lib/transactions";

const ARCHIVE_DIR = path.join(process.cwd(), "..", "archivio");

export async function GET() {
  try {
    const txs = loadTransactions();
    return NextResponse.json({ transactions: txs });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error loading transactions" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { filename, content } = (await request.json()) as {
      filename?: string;
      content?: string;
    };

    if (!content) {
      return NextResponse.json({ error: "Nessun contenuto" }, { status: 400 });
    }

    // 1. Archiviazione file originale
    if (!fs.existsSync(ARCHIVE_DIR)) {
      fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    }

    const hash = crypto.createHash("sha256").update(content).digest("hex");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeName = (filename || "estratto.csv").replace(/[^\w.\-]/g, "_");
    const outName = `${stamp}__${safeName}`;
    const outPath = path.join(ARCHIVE_DIR, outName);

    const finalPath = fs.existsSync(outPath)
      ? path.join(ARCHIVE_DIR, `${stamp}__${hash.slice(0, 8)}__${safeName}`)
      : outPath;

    fs.writeFileSync(finalPath, content, "utf-8");

    // 2. Parsing e unione con il database globale
    const newTxs = parseCSV(content);
    const merged = addTransactions(newTxs);

    return NextResponse.json({
      success: true,
      archivedAs: path.basename(finalPath),
      hash,
      transactions: merged,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore elaborazione" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { id, ignored } = (await request.json()) as {
      id?: string;
      ignored?: boolean;
    };

    if (!id) {
      return NextResponse.json({ error: "ID transazione mancante" }, { status: 400 });
    }

    const txs = loadTransactions();
    const idx = txs.findIndex((t) => txId(t) === id);

    if (idx < 0) {
      return NextResponse.json({ error: "Transazione non trovata" }, { status: 404 });
    }

    txs[idx] = {
      ...txs[idx],
      ignored: !!ignored,
    };

    saveTransactions(txs);

    return NextResponse.json({ success: true, transactions: txs });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore aggiornamento transazione" },
      { status: 500 }
    );
  }
}
