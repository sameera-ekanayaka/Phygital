# 🏦 Phygital Cash-Flow Identity Engine

> **Bridging informal, underbanked micro-enterprises with formal commercial credit via Multimodal Trilingual AI, Dynamic Cash-Flow Scoring, and Cryptographic Verification.**

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI%200.115-009688.svg?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/Frontend-React%2019%20%7C%20Vite%208-61DAFB.svg?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript%205.8-3178C6.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Python](https://img.shields.io/badge/Language-Python%203.11%2B-3776AB.svg?style=flat-square&logo=python)](https://python.org)
[![Tests](https://img.shields.io/badge/Tests-124%20Passed%20(100%25)-success.svg?style=flat-square&logo=pytest)](https://pytest.org)
[![Compliance](https://img.shields.io/badge/Compliance-PDPA%20No.%209%20of%202022-blue.svg?style=flat-square)](https://www.dpa.gov.lk)
[![LankaSign](https://img.shields.io/badge/Digital%20Signatures-LankaSign%20ETA%202006-darkgreen.svg?style=flat-square)](https://www.lankaclear.com)

---

## 📌 Executive Summary

Over **60% of Sri Lanka's micro, small, and medium enterprises (MSMEs)** operate in the informal cash economy. Despite generating viable, consistent daily revenue, they are systematically excluded from formal commercial lending due to lack of audited financial statements, tax returns, or immovable collateral. Consequently, merchants are forced into predatory informal lending at exorbitant interest rates (40%–120% APR).

The **Phygital Cash-Flow Identity Engine** solves this credit-invisibility crisis. By transforming unstructured, everyday paper artifacts (*Potha* handwritten ledgers, crumpled receipts) and trilingual voice memos into an **auditable, bank-grade Credit Assessment Dossier**, Phygital enables commercial banks to evaluate informal SME debt capacity deterministically in under 3 minutes—backed by the **National Credit Guarantee Institution (NCGI)** credit guarantee scheme.

---

## 🏛️ System Architecture: The "Phygital Handoff"

Phygital operates as a two-sided platform engineered for low-friction data collection on the borrower side and institutional-grade appraisal on the banking side.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   PHYGITAL CASH-FLOW PLATFORM                               │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
          │                                                                  │
          ▼                                                                  ▼
┌───────────────────────────────────┐                     ┌───────────────────────────────────┐
│     BORROWER MOBILE PORTAL        │                     │    BANK CREDIT OFFICER PORTAL     │
│  (React 19 / Tailwind / Lucide)   │                     │ (Desktop Dark Cockpit / Recharts) │
│                                   │                     │                                   │
│ • WebM/WAV Voice Memo Recording   │                     │ • PHYG-XXXX-XXXX Code Resolver    │
│ • Camera / "Potha" Ledger Photos  │                     │ • Real-Time DSCR Financial Gauge  │
│ • Quick LKR Line-Item Entry       │                     │ • Anomaly & Volatility Outliers   │
│ • Dynamic Liya Shakthi Detection  │                     │ • Sinhala / English Field Prompts │
│ • 1-Tap "Submit to Bank" Handoff  │                     │ • LankaSign Digital Execution     │
└───────────────────────────────────┘                     └───────────────────────────────────┘
          │                                                                  ▲
          │ POST /api/v1/ingest/upload                                       │ GET /api/v1/verification/resolve/
          ▼                                                                  │
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                             FASTAPI BACKEND PROCESSING ENGINE                               │
│                                                                                             │
│  ┌──────────────────────────┐  ┌──────────────────────────┐  ┌───────────────────────────┐  │
│  │     VOICE PIPELINE       │  │       OCR PIPELINE       │  │   STRUCTURED EXTRACTION   │  │
│  │ OpenAI Whisper / Groq v3 │  │ Google Vision / Gemini   │  │  GPT-4o Structured Parser │  │
│  │ (Sinhala/Tamil/Singlish) │  │  (Handwritten Ledgers)   │  │ (Revenue vs Expenses vs   │  │
│  │                          │  │                          │  │   Personal Drawings)      │  │
│  └──────────────────────────┘  └──────────────────────────┘  └───────────────────────────┘  │
│                                              │                                              │
│                                              ▼                                              │
│                         ┌────────────────────────────────────────┐                          │
│                         │        FINANCIAL SCORING ENGINE        │                          │
│                         │  • Net Operating Income (NOI)          │                          │
│                         │  • Dynamic DSCR Calculation            │                          │
│                         │  • 67% - 80% NCGI Risk Mapping         │                          │
│                         │  • CBSL Capital Adequacy Optimization  │                          │
│                         └────────────────────────────────────────┘                          │
│                                              │                                              │
│                                              ▼                                              │
│                         ┌────────────────────────────────────────┐                          │
│                         │  CRYPTOGRAPHIC HANDOFF & VAULT (REDIS) │                          │
│                         │  • Verification Code: PHYG-XXXX-XXXX   │                          │
│                         │  • 72-Hour HMAC-SHA256 Signed Token    │                          │
│                         │  • Ephemeral Vault (72h Auto-Purge)    │                          │
│                         └────────────────────────────────────────┘                          │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### The Two-Sided Interaction Flow

1. **Borrower Portal (Mobile-First)**:
   - Designed for low-literacy, mobile-first merchants operating in vibrant rural/semi-urban markets.
   - Accepts photos of handwritten credit ledgers (*Potha*), invoices, receipts, and trilingual voice notes (e.g., *"Ada thel pol Rs. 18,500k wikunuwa, lorry ekata Rs. 3,200k damma"*).
   - Instant client-side validation for Sri Lankan National Identity Cards (NIC), canonical phone normalization (`07XXXXXXXX`), and transaction amounts.
   - Upon submission, generates a unique, human-readable **8-character verification code** (`PHYG-XXXX-XXXX`) and QR code.

2. **Bank Officer Portal (Desktop-First)**:
   - Optimized for commercial credit analysts and field verification officers in a high-density, low-glare dark cockpit (`#0A1128` Deep Navy / Champagne Gold).
   - Resolves the merchant's 72-hour credit dossier instantly by entering the `PHYG-XXXX-XXXX` code or scanning the QR code.
   - Displays real-time Cash-Flow DSCR, Net Operating Income, 30-day volatility analysis, anomaly warnings, and contextual trilingual interview prompts for on-site field verification.
   - Executes the final legally binding loan disbursal via **LankaSign digital contract execution**.

---

## ⚡ Core Features & Regulatory Compliance

### 1. Trilingual Natural Language Processing (Sinhala, Tamil, Singlish)
- **Acoustic Dialect Tuning**: Powered by Whisper large-v3 and OpenAI Whisper models fine-tuned with Sri Lankan financial vocabulary (*Potha*, *Samurdhi*, *Cheetu*, *Lorry Hire*, *Pol Thel*, *Wattakka*).
- **Code-Mixed Understanding**: Native comprehension of Singlish (Sinhala written in Latin script or blended with English business terms) and Tamil agricultural accounting terms.
- **Cash-Flow Segregation**: Automatically isolates personal household drawings (groceries, school fees, medical) from legitimate business operating expenditures (inventory, wages, utilities, transport).
- **Triangulation Hints**: Extracts cross-referencing markers (merchant locations, telco transfer references, recurring supplier patterns) to empower loan officers against synthetic credit fraud.

### 2. Deterministic Financial Scoring & NCGI Risk Coverage
- **Standardized Debt Service Coverage Ratio (DSCR)**:
  $$\text{EMI} = P \times \frac{r(1+r)^n}{(1+r)^n - 1}$$
  $$\text{DSCR} = \frac{\text{Net Operating Income (NOI)}}{\text{Monthly Debt Service (EMI)}}$$
  Calculated deterministically against a benchmark 14.0% p.a. commercial base rate.
- **Prudent Loan Ceilings**: Recommends a maximum loan principal that maintains $\text{DSCR} \ge 1.25$, capped at $3.5\times \text{NOI}$.
- **NCGI Risk Coverage Tiering**:
  - **Tier 1 ($\text{DSCR} \ge 1.50$)**: **80% NCGI Credit Guarantee** backing.
  - **Tier 2 ($1.25 \le \text{DSCR} < 1.50$)**: **75% NCGI Credit Guarantee** backing.
  - **NCGI Liya Shakthi Concession**: Female-owned micro-enterprises automatically unlock an **80% credit risk guarantee** plus a **50 bps (0.50%) interest rate concession** in accordance with national gender-lens financial inclusion mandates.
- **CBSL Risk Weight Relief**: Under Central Bank of Sri Lanka (CBSL) Direction No. 03 of 2024, the guaranteed portion carries a **0% risk weight**, substantially lowering commercial bank regulatory capital requirements (CAR relief).

### 3. Sri Lanka Personal Data Protection Act (PDPA) No. 9 of 2022
- **Section 12 (Data Minimization & Ephemeral Data Vault)**: Raw media artifacts (voice audio recordings, uploaded ledger images) are stored strictly within an Ephemeral Vault with an auto-expiring TTL of 72 hours (`data_retention_hours=72`). Once the credit assessment token expires, raw media is purged.
- **Section 14 (Right-to-Erasure)**: Dedicated `/api/v1/consent/revoke` endpoint enables borrowers to withdraw consent at any time. Revocation triggers an immediate purge of all Redis session keys (`session:<id>:*`).
- **Tamper-Evident Audit Trail**: Every consent grant, data access, and revocation is recorded in an immutable audit ledger (`/api/v1/consent/audit-log/{consent_id}`).

### 4. Electronic Transactions Act (ETA) No. 19 of 2006 (LankaSign Handshake)
- Conforms to Sections 7 & 8 of Sri Lanka Electronic Transactions Act No. 19 of 2006.
- The `/api/v1/dossier/execute-loan` endpoint completes the legal handshake:
  - Generates an immutable SHA-256 hash of the complete credit assessment dossier.
  - Binds the Officer ID, borrower NIC hash, approved loan amount, and NCGI guarantee percentage.
  - Simulates the PKI-based **LankaSign digital signature certificate** execution.

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend Framework** | **React 19 + TypeScript + Vite 8** | High-performance SPA with client-side routing |
| **Styling & UI** | **Tailwind CSS + Lucide React** | Dual design system (Warm Cream for SMEs / Navy-Gold for Banks) |
| **Data Visualization** | **Recharts 3** | Responsive cash-flow charts, DSCR gauges, monthly aggregates |
| **Backend Framework** | **FastAPI (Python 3.11+)** | Asynchronous OpenAPI engine with auto-generated documentation |
| **Validation Engine** | **Pydantic v2 + Custom Validators** | Strict Sri Lankan NIC, phone, and financial amount validation |
| **Ephemeral Cache** | **Redis 5.0 / Fakeredis** | Token TTL management, rate limiting, and ephemeral vault storage |
| **OCR Engines** | **Google Gemini 2.0 Flash / Vision** | Handwritten Sinhala/Tamil/English *Potha* text extraction |
| **Speech-to-Text** | **OpenAI Whisper / Groq Whisper v3** | Sub-second trilingual audio transcription |
| **LLM Reasoning** | **GPT-4o / Groq Llama 3.3 70B** | JSON structured cash-flow categorization and anomaly analysis |
| **Cryptographic Layer** | **PyJWT + hashlib (HMAC-SHA256)** | Time-locked 72-hour token minting and signature verification |

---

## 🚀 Local Setup Instructions

Follow these step-by-step instructions to run the entire system locally in under 3 minutes.

### 1. Prerequisites
- **Python**: Version `3.10` or higher (`python --version`)
- **Node.js**: Version `18.0` or higher (`node --version`)
- **Git**: For cloning and repository tracking

---

### 2. Backend Setup

Open a terminal in the root directory:

```bash
# 1. Navigate to the backend directory
cd backend

# 2. Create a Python virtual environment
python -m venv venv

# 3. Activate the virtual environment
# Windows PowerShell:
.\venv\Scripts\Activate.ps1
# Linux / macOS:
# source venv/bin/activate

# 4. Upgrade pip and install dependencies
pip install --upgrade pip
pip install -r requirements.txt
```

#### Configure Environment Variables
Create a `.env` file inside the `backend/` directory:

```bash
# Copy template or create backend/.env
```

```env
# Cryptographic signing key (minimum 16 characters)
SECRET_KEY=phygital_buildathon_super_secret_key_2026

# Redis URL (If Redis is not running locally, the system automatically falls back to Fakeredis)
REDIS_URL=redis://localhost:6379/0

# Application Configuration
DEBUG=True
BASE_URL=http://localhost:5173

# PDPA Compliance Settings
DATA_RETENTION_HOURS=72
TRANSACTION_RETENTION_DAYS=30
CONSENT_EXPIRY_DAYS=365

# Bank Officer Credentials (JSON format)
OFFICER_CREDENTIALS={"officer.perera":"PhygitalBank2026!"}

# AI Engine Service Keys (Leave blank or provide your own API keys for live AI processing)
# When keys are absent, the system seamlessly operates on deterministic mock fallbacks!
GROQ_API_KEY=
GOOGLE_API_KEY=
OPENAI_API_KEY=
```

#### Start the Backend Server
```bash
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
The FastAPI interactive documentation will be live at:
- **Swagger UI**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **ReDoc**: [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)

---

### 3. Frontend Setup

Open a **second terminal** window:

```bash
# 1. Navigate to the frontend directory
cd frontend

# 2. Install Node dependencies
npm install

# 3. Start the Vite development server
npm run dev -- --host 127.0.0.1 --port 5173
```
The application will be accessible in your browser at:
- **Web Application**: [http://127.0.0.1:5173](http://127.0.0.1:5173)

---

## 🔑 Pre-Configured Demo Credentials

For pitch evaluators and judges, the platform features **1-Click Auto-Fill Demo Credentials** on both login screens:

| Portal | URL | Username / NIC | Password | Description |
|---|---|---|---|---|
| **Borrower Portal** | `/borrower/login` | `896543456V` | `test1234` | Binithi Perera (Handmade Batik Studio, Kandy) |
| **Bank Officer Cockpit** | `/bank/login` | `officer.perera` | `PhygitalBank2026!` | Senior Credit Underwriter, Commercial Banking |

*Note: Strict role-segregation is enforced at the JWT middleware level. Borrower credentials cannot access the bank dashboard, and officer credentials cannot log into borrower sessions.*

---

## 🧪 Testing & Quality Assurance

The codebase includes an exhaustive unit and integration test suite covering scoring calculations, OCR/Audio ingest pipelines, PDPA purge mechanics, and standard validation bounds.

### Run Backend Pytest Suite
In the `backend/` directory with virtual environment activated:

```bash
# Run the complete test suite
python -m pytest tests

# Run with verbose output
python -m pytest tests -v

# Run only the validation test suite
python -m pytest tests/test_validation.py -v
```

**Test Suite Coverage Summary**:
```text
============================= test session starts =============================
collected 124 items

tests\test_validation.py ........................                        [ 19%]
tests\test_dossier.py ......................                             [ 37%]
tests\test_ingest.py .....                                               [ 41%]
tests\test_ocr.py ...                                                    [ 43%]
tests\test_qrcode.py ..........                                          [ 51%]
tests\test_security.py ...........                                       [ 60%]
tests\test_transactions.py ............................................. [ 96%]
tests\test_cleanup.py ....                                               [100%]

======================== 124 passed in 0.05s (100%) ==========================
```

### Run Frontend Static Typecheck & Build Validation
In the `frontend/` directory:

```bash
# Verify TypeScript strict type-checking
npx tsc --noEmit

# Verify production bundle compilation
npm run build
```

---

## 📂 Repository Structure

```text
Phygital/
├── backend/
│   ├── app/
│   │   ├── api/v1/
│   │   │   ├── borrower_auth/      # Borrower registration, phone indexing, OTP & JWT auth
│   │   │   ├── consent/            # PDPA consent recording, audit trails & right-to-erasure
│   │   │   ├── dossier/            # Credit assessment, DSCR scoring & LankaSign execution
│   │   │   ├── ingest/             # Multimodal upload (Voice / Ledger OCR / Notes)
│   │   │   ├── qrcode/             # PHYG-XXXX-XXXX verification code generation & lookup
│   │   │   └── transactions/       # Manual transaction CRUD, monthly aggregation & summaries
│   │   ├── core/
│   │   │   ├── auth.py             # Role-based JWT authentication & officer verification
│   │   │   ├── limiter.py          # SlowAPI rate limiting configuration
│   │   │   ├── redis_client.py     # Redis connection pool with transparent Fakeredis fallback
│   │   │   ├── security.py         # 72-hour HMAC-SHA256 token minting & validation
│   │   │   └── validation.py       # Standard Sri Lankan NIC, phone, amount & MIME validators
│   │   ├── schemas/                # Domain Pydantic transfer models
│   │   ├── services/
│   │   │   ├── ai_engine.py        # Whisper transcription, Gemini/GPT-4o Vision OCR
│   │   │   └── scoring_engine.py   # Deterministic DSCR, NCGI tiering & trilingual prompt logic
│   │   ├── config.py               # Pydantic v2 runtime settings
│   │   └── main.py                 # FastAPI application factory, middleware & router mounting
│   ├── tests/                      # 124 automated unit & integration test cases
│   └── requirements.txt            # Python production dependencies
│
├── frontend/
│   ├── src/
│   │   ├── components/             # Role-based layouts, navigation bars & common UI
│   │   ├── hooks/                  # Audio voice recorder & countdown timers
│   │   ├── pages/
│   │   │   ├── bank/               # BankLogin, BankVerify, BankDossier (Underwriter Cockpit)
│   │   │   └── borrower/           # BorrowerLogin, Register, OTP, Dashboard, AddTransaction
│   │   ├── services/               # Typed Axios HTTP client with persistent token handling
│   │   ├── utils/
│   │   │   └── validation.ts       # Client-side NIC format, phone normalization & amount checks
│   │   ├── App.tsx                 # Route declarations & role boundaries
│   │   └── index.css               # Design system typography, glassmorphism & color tokens
│   ├── package.json                # Node dependencies & build scripts
│   ├── tailwind.config.js          # Custom theme extensions (Warm Cream & Dark Navy palettes)
│   └── vite.config.ts              # Vite bundling & proxy configurations
│
└── README.md                       # Complete technical & architectural documentation
```

---

## 👥 Contributors & Acknowledgements

Developed for the **Alibaba AI Buildathon 2026** by team **Nexora**.
- Dedicated to the millions of informal entrepreneurs across Sri Lanka powering our local markets.
- Compliant with **Central Bank of Sri Lanka (CBSL)** Financial Inclusion Framework and **NCGI** Credit Guarantee Directives.
