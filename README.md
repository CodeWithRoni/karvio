# KARVIO ERP

# Current online backend — Supabase

The online app now defaults to the dedicated Karvio Supabase project (`svqhlotlzgmwjneuphpe`). Sign in with the owner-created account; there is no default online password. See [SUPABASE-SETUP.md](SUPABASE-SETUP.md) for backend architecture, migrations, private backups and deployment. Google Sheets instructions and default credentials below apply to the legacy Apps Script/offline setup, not this fresh Supabase shop.

Current application version: **1.2.0**. Earlier 1.0.6 documents are retained as release history; use SETUP.md and FIXES-REVIEW.md for current setup and pending fixes.
### Smart Business Management & Point of Sale System

**A Modern, Powerful & Flexible ERP Solution for Retail, Computer, IT, Electronics and Networking Businesses.**

Karvio ERP is a business management and Point of Sale (POS) application designed to simplify daily business operations, improve inventory control, manage financial transactions and provide useful business insights through a unified system.

The project supports web-based operations and an offline desktop environment, allowing businesses to choose the setup that best fits their workflow.

---

## 🚀 Key Features

### 🛒 Point of Sale (POS)
- Fast and efficient sales processing
- Product search and barcode/serial-based selection
- Sales invoices and printable receipts
- Multiple payment and transaction records
- Customer information management
- Sales returns and invoice history
- Serial number tracking for applicable products

### 📦 Inventory Management
- Product and category management
- Brand and unit management
- Stock tracking and inventory updates
- Purchase and supplier management
- Serial-number-based product management
- Purchase returns
- Product cost and stock valuation tracking

### 💰 Finance & Accounting
- Sales and purchase records
- Expense management
- Customer and supplier balances
- Payment and due tracking
- Gross profit and net profit reporting
- Financial summaries and business performance monitoring

### 📊 Dashboard & Reports
- Business overview dashboard
- Sales and purchase summaries
- Inventory reports
- Profit analysis
- Expense reporting
- Transaction history
- Advanced product, invoice and serial search

### 👥 User & Access Management
- Administrator account
- Role-based permissions
- Controlled access to business information
- Protected administrative operations
- User and session management

### 🔐 Database & Backup
- Database backup and restore functionality
- Administrative database reset
- Data validation and recovery mechanisms
- Transaction integrity protections
- Persistent local storage for offline desktop usage

---

## 🖥️ Supported Environments

| Platform | Technology |
|---|---|
| Web Application | React |
| Online Backend | Google Apps Script |
| Online Database | Google Sheets |
| Desktop Application | Electron |
| Offline Storage | Local persistent data |
| Frontend Build Tool | Vite |
| Mobile-oriented UI | React web interface |

Native application packaging depends on the appropriate platform toolchains and build configuration.

---

## 🏗️ Project Architecture

Karvio ERP contains two primary operating environments.

**Online Mode**

The frontend communicates with a Google Apps Script backend, which manages business operations and stores records in Google Sheets.

**Offline Desktop Mode**

The Electron desktop application operates using a local backend and persistent local data storage.

Offline and online databases are separate. Automatic synchronization between them is not currently provided.

### Repository Structure

```text
karvio/
├── backend/
│   ├── Code.gs
│   └── test/
├── frontend/
│   ├── src/
│   ├── desktop/
│   ├── dist/
│   ├── package.json
│   └── ...
├── README.md
├── SETUP.md
├── AI_HANDOVER.md
├── VERIFICATION.md
└── ...
```

---

## ⚙️ Installation & Development

### Prerequisites

- Node.js
- npm
- Git
- Modern web browser
- Google account and Google Apps Script access for online deployment
- Electron-compatible desktop environment for offline desktop use

### Clone the Repository

```bash
git clone https://github.com/CodeWithRoni/karvio.git
cd karvio
```

### Install Dependencies

```bash
cd frontend
npm ci
```

### Start Development Server

```bash
npm run dev
```

### Build the Frontend

```bash
npm run build
```

### Run Automated Tests

```bash
npm test
```

### Run Browser Tests

```bash
npm run test:e2e
```

### Start Offline Desktop Application

```bash
npm run desktop
```

### Start Online Desktop Application

```bash
npm run desktop:online
```

---

## ☁️ Online Backend Setup

Karvio ERP uses Google Apps Script and Google Sheets for its online backend.

Basic setup procedure:

1. Create or prepare a Google Apps Script project.
2. Configure the required Google Sheets database.
3. Use the authoritative backend source from `backend/Code.gs`.
4. Deploy the Apps Script project as a Web App with appropriate access settings.
5. Configure the frontend API endpoint.
6. Build and deploy the frontend.
7. Verify authentication, inventory, sales and financial operations.

For an existing installation, back up the database before upgrading. Do not overwrite production records or reset administrator credentials without an intentional migration plan.

Detailed instructions are available in `SETUP.md` and `UPLOAD_GUIDE-বাংলা.md`.

---

## 💾 Offline Desktop Application

Karvio ERP includes an Electron desktop environment. Fresh standard installers open the online shop by default and require your existing shop account. Existing offline data is detected and kept in offline mode; it is never merged into the online shop. Launch with `--online` or `--offline` to choose explicitly. The separate portable offline build stays offline by default. Online and offline databases do not sync. Older downloaded installers must be replaced by a newly built version to receive this behavior.

Key capabilities:

- Local business data storage
- Offline POS operations
- Persistent application data
- Local backup and restore support
- Independent offline operation

The desktop application uses the `Karvio Offline` data directory.

**Important:** Offline and online data are not automatically synchronized. Keep backups of each environment separately.

---

## 🔒 Security & Data Protection

Karvio ERP includes mechanisms for authentication, access control and transaction consistency.

Security practices:

- Protect administrator credentials.
- Restrict access to business data.
- Never commit real customer records or production databases.
- Never expose API credentials or private tokens.
- Maintain regular database backups.
- Test updates before deploying to production.
- Follow least-privilege access principles.

Production security depends on correct deployment, configuration and operational maintenance.

---

## 🧪 Testing & Verification

The project includes automated tests covering important application workflows and data integrity behavior.

Testing areas include:

- Sales and purchase operations
- Inventory and serial management
- Financial calculations
- Backup and restore
- Database recovery
- Access permissions
- Offline data compatibility
- Browser workflows

Run the relevant tests after making changes to the application.

For additional technical details, see `VERIFICATION.md`.

---

## 🔄 Development Principles

Karvio ERP is maintained with the following goals:

- Reliable business transactions
- Consistent inventory records
- Clear financial calculations
- User-friendly interfaces
- Maintainable source code
- Safe database operations
- Cross-platform usability
- Backward compatibility where possible

Every major change should be tested before release.

---

## 📚 Documentation

| File | Purpose |
|---|---|
| `README.md` | Project introduction and overview |
| `SETUP.md` | Installation and setup instructions |
| `AI_HANDOVER.md` | Technical architecture and maintenance notes |
| `VERIFICATION.md` | Testing and verification information |
| `CHANGES.md` | Project change history |
| `UPLOAD_GUIDE-বাংলা.md` | Bengali deployment instructions |

---

## 🛣️ Future Development

Potential future improvements include:

- Enhanced reporting and analytics
- Improved mobile experience
- Additional business automation
- Extended integrations
- Performance optimization
- More deployment options
- Additional security and backup capabilities

These are development directions, not promises of currently available functionality.

---

## 👨‍💻 Developer

**CodeWithRoni**

GitHub: https://github.com/CodeWithRoni

Repository: https://github.com/CodeWithRoni/karvio

---

## 📌 Project Status

**Project:** Karvio ERP  
**Category:** Business Management / ERP / POS  
**Primary Technologies:** React, Google Apps Script, Google Sheets, Electron  
**Development:** Actively maintained project  
**Deployment:** Online Web and Offline Desktop

For release-specific information, consult the repository's release notes and verification documents.

---

**KARVIO ERP — Manage Smarter. Work Faster. Grow Better.**