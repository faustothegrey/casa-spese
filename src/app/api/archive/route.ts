import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";

// Archivia l'estratto originale caricato dall'utente, con impronta (hash).
// Principio: l'originale non si tocca mai e resta consultabile.
// Salva in ../archivio (fuori dall'app), un file per upload.
const ARCHIVE_DIR = path.join(process.cwd(), "..", "archivio");

export async function POST(request: NextRequest) {
  try {
    const { filename, content } = (await request.json()) as {
      filename?: string;
      content?: string;
    };
    if (!content) {
      return NextResponse.json({ error: "Nessun contenuto" }, { status: 400 });
    }

    if (!fs.existsSync(ARCHIVE_DIR)) {
      fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    }

    const hash = crypto.createHash("sha256").update(content).digest("hex");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeName = (filename || "estratto.csv").replace(/[^\w.\-]/g, "_");
    const outName = `${stamp}__${safeName}`;
    const outPath = path.join(ARCHIVE_DIR, outName);

    // Non sovrascrivere mai: se per qualche motivo esiste, aggiunge l'hash.
    const finalPath = fs.existsSync(outPath)
      ? path.join(ARCHIVE_DIR, `${stamp}__${hash.slice(0, 8)}__${safeName}`)
      : outPath;

    fs.writeFileSync(finalPath, content, "utf-8");

    return NextResponse.json({
      success: true,
      archivedAs: path.basename(finalPath),
      hash,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore archiviazione" },
      { status: 500 }
    );
  }
}
