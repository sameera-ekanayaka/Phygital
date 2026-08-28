# Phygital Cash-Flow Engine — Backend

FastAPI backend that converts informal financial records into bank-grade cash-flow dossiers.

## Quick Start

```bash
# 1. Create a virtual environment
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS / Linux

# 2. Install dependencies
pip install -r requirements.txt

# 3. Copy environment template
copy .env.example .env        # Windows
# cp .env.example .env        # macOS / Linux

# 4. Run the development server
uvicorn app.main:app --reload
```

Visit [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) for the interactive API docs.

## Endpoints

| Method | Path                           | Description                          |
|--------|--------------------------------|--------------------------------------|
| POST   | `/api/v1/whatsapp/webhook`     | Twilio WhatsApp inbound webhook      |
| POST   | `/api/v1/ocr/process`          | Mock OCR ledger image processing     |
| POST   | `/api/v1/qrcode/generate`      | Generate expiring QR code            |
| GET    | `/api/v1/qrcode/verify/{token}`| Verify QR token & return cash-flow   |
| GET    | `/health`                      | Liveness probe                       |
