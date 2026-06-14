import { google } from "googleapis";
import fs from "fs";
import path from "path";

const CREDENTIALS_PATH = path.join(process.cwd(), "..", "credentials.json");
const TOKEN_PATH = path.join(process.cwd(), "token.json");

function getCredentials() {
  const content = fs.readFileSync(CREDENTIALS_PATH, "utf-8");
  return JSON.parse(content).installed;
}

export function getOAuth2Client() {
  const creds = getCredentials();
  return new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    "http://localhost:3000/api/auth/callback"
  );
}

export function getAuthUrl() {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/spreadsheets"],
    prompt: "consent",
  });
}

export function saveToken(token: object) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
}

export function loadToken(): Record<string, unknown> | null {
  try {
    const content = fs.readFileSync(TOKEN_PATH, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// Cancella il token salvato (es. quando è scaduto/revocato) per forzare la riconnessione.
export function clearToken() {
  try {
    fs.unlinkSync(TOKEN_PATH);
  } catch {
    // file già assente: ok
  }
}

export function getAuthenticatedClient() {
  const token = loadToken();
  if (!token) return null;
  const client = getOAuth2Client();
  client.setCredentials(token);
  // Quando googleapis rinnova l'access token, lo persistiamo (mantenendo il refresh_token).
  client.on("tokens", (t) => {
    const existing = loadToken() || {};
    saveToken({ ...existing, ...t });
  });
  return client;
}
