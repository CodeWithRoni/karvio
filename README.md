# Karvio

Shop management & POS for a computer, IT accessories and networking retail/wholesale business.

- **Frontend:** React (Vite) — POS with barcode & serial support, stock explorer, purchases & returns, multi-account ledger (cash / bKash / Nagad / bank), customer dues (Bakir Khata), warranty claims, item history explorer, PC builder & quotations, reports with Excel / PDF / print, role-based access, dark/light mode.
- **Backend:** Google Apps Script (`backend/Code.gs`) deployed as a Web App, with Google Sheets as the database.
- **Live app:** published to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.

See **[SETUP.md](SETUP.md)** for the full setup guide (Bangla).

```bash
cd frontend
npm install
npm run dev     # http://localhost:5173
```

Backend tests (offline simulation of Apps Script):

```bash
node backend/test/simulate.js
```
