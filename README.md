# CasaSpese UI

Next.js application for personal transaction categorization and Google Sheets reconciliation.

> [!IMPORTANT]
> **READ THE VAULT FIRST!**
> Anyone working on this project must first read the project documentation and current session state located in the Obsidian Vault:
> **Vault Path:** `/Users/fausto/Cowork-Projects/MyFinance2/Vault`
>
> Key notes to review before writing any code:
> 1. `Stato Sessione (ripresa).md` — Current active tasks, issues, and progress.
> 2. `Progetti/Progetto - Sistema Riconciliazione Spese (design).md` — Core architectural requirements (pure functions, deterministic rules, no black-box/ML).
> 3. `Progetti/Spese senza traccia bancaria (design).md` — Recurring items and cash flow tracking logic.

---

## Getting Started

1. **Configure credentials:**
   Ensure `credentials.json` (Google OAuth client credentials) is placed in the parent directory (`/Users/fausto/Software/CasaSpese/credentials.json`).

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) with your browser.

4. **Authenticate Google Account:**
   Click the "Connetti Google Account" button on the dashboard to authenticate and write transactions directly to your Google Sheet.
