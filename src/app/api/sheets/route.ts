import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getAuthenticatedClient, clearToken } from "@/lib/google-auth";

const SPREADSHEET_ID = "1YazkQsziwH0N1TOu_qolzBaEIfXobfa76nE_klNHa2Q";
const CONTI_SHEET_ID = 1811352964;

function parseDateDMY(dateStr: string): Date | null {
  if (!dateStr) return null;
  const [d, m, y] = dateStr.split("/").map(Number);
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
}

// Riconosce gli errori di autenticazione (token scaduto/revocato) per chiedere
// all'utente di riconnettersi invece di restituire un 500.
function isAuthError(err: unknown): boolean {
  const e = err as {
    message?: string;
    code?: number | string;
    response?: { data?: { error?: string } };
  };
  const text = `${e?.message || ""} ${e?.response?.data?.error || ""}`;
  return (
    /invalid_grant|invalid_token|unauthorized|token has been expired or revoked/i.test(text) ||
    e?.code === 401 ||
    e?.code === "401"
  );
}

// Se l'errore è di autenticazione: cancella il token e risponde 401 (reauth).
function handleApiError(err: unknown) {
  if (isAuthError(err)) {
    clearToken();
    return NextResponse.json({ error: "reauth" }, { status: 401 });
  }
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Errore Google Sheets" },
    { status: 500 }
  );
}

export async function GET(request: NextRequest) {
  const sheetName = request.nextUrl.searchParams.get("sheet") || "Conti";

  const auth = getAuthenticatedClient();
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const sheets = google.sheets({ version: "v4", auth });

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: sheetName,
    });
    const rows = response.data.values || [];
    return NextResponse.json({ rows });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  const auth = getAuthenticatedClient();
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const { data, cosa, altro, importo, anticipatoDa } = body as {
    data: string; // DD/MM/YYYY
    cosa: string;
    altro: string;
    importo: string; // formatted like "€ 50,00"
    anticipatoDa: "fausto" | "al";
  };

  if (!data || !importo) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const sheets = google.sheets({ version: "v4", auth });

  try {
    // Read existing rows to find insertion position
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Conti",
    });

    const rows = existing.data.values || [];
    const newDate = parseDateDMY(data);

    // Find the right row index to insert (sorted by date, skip header)
    // We insert after the last row with a date <= our date
    let insertIndex = rows.length; // default: append at end

    if (newDate) {
      // Scan from the end backwards, find first row with date <= newDate
      for (let i = rows.length - 1; i >= 1; i--) {
        const rowDate = parseDateDMY(rows[i][2] || "");
        if (rowDate && rowDate <= newDate) {
          insertIndex = i + 1;
          break;
        }
      }
    }

    // Build the new row
    const anticipatoFausto = anticipatoDa === "fausto" ? importo : "";
    const anticipatoAL = anticipatoDa === "al" ? importo : "";
    const newRow = [
      "", // Periodo (empty, inherits from block)
      "Da Saldare", // Stato
      data,
      cosa,
      altro,
      importo,
      anticipatoFausto,
      anticipatoAL,
    ];

    // Insert a blank row at the position using the Sheets API
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            insertDimension: {
              range: {
                sheetId: CONTI_SHEET_ID,
                dimension: "ROWS",
                startIndex: insertIndex,
                endIndex: insertIndex + 1,
              },
              inheritFromBefore: true,
            },
          },
        ],
      },
    });

    // Write the data into the newly inserted row
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Conti!A${insertIndex + 1}:H${insertIndex + 1}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [newRow],
      },
    });

    return NextResponse.json({ success: true, insertedAt: insertIndex + 1 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(request: NextRequest) {
  const auth = getAuthenticatedClient();
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, periodKey } = body as {
      action: string;
      periodKey: string;
    };

    if (action !== "reopen" || !periodKey) {
      return NextResponse.json({ error: "Azione o chiave periodo non valida" }, { status: 400 });
    }

    const sheets = google.sheets({ version: "v4", auth });

    // Leggi le righe correnti
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Conti",
    });

    const rows = existing.data.values || [];
    const dataToUpdate: { range: string; values: string[][] }[] = [];

    // Trova le righe appartenenti al periodo da riaprire e le cui righe sono "Saldato"
    // Ricordiamo che la riga i in rows corrisponde a Conti!B{i + 1}
    for (let i = 1; i < rows.length; i++) {
      const dateStr = (rows[i][2] || "").trim();
      if (!dateStr) continue;

      const rowDate = parseDateDMY(dateStr);
      if (!rowDate) continue;

      // Calcolo periodForDate locale
      let end: Date;
      if (rowDate.getDate() >= 24) {
        end = new Date(rowDate.getFullYear(), rowDate.getMonth() + 1, 23);
      } else {
        end = new Date(rowDate.getFullYear(), rowDate.getMonth(), 23);
      }
      const pad = (n: number) => String(n).padStart(2, "0");
      const rowPeriodKey = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;

      if (rowPeriodKey === periodKey) {
        const currentStatus = (rows[i][1] || "").trim().toLowerCase();
        if (currentStatus === "saldato") {
          dataToUpdate.push({
            range: `Conti!B${i + 1}`,
            values: [["Da Saldare"]],
          });
        }
      }
    }

    if (dataToUpdate.length === 0) {
      return NextResponse.json({ success: true, message: "Nessuna riga da aggiornare" });
    }

    // Esegui l'aggiornamento batch dei valori
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: dataToUpdate,
      },
    });

    return NextResponse.json({ success: true, updatedCount: dataToUpdate.length });
  } catch (err) {
    return handleApiError(err);
  }
}

