/**
 * Centralized Axios client for the Phygital backend API.
 * Provides typed helper functions for ingest upload and QR code generation.
 */
import axios from "axios";

/* ------------------------------------------------------------------ */
/*  Response types (mirror backend Pydantic schemas)                   */
/* ------------------------------------------------------------------ */

export interface TransactionItem {
  amount: number;
  category: string;
  description: string;
  source_confidence: number;
}

export interface StructuredExtraction {
  business_revenue: TransactionItem[];
  business_expense: TransactionItem[];
  personal_expense: TransactionItem[];
  currency: string;
  period: string;
  business_name: string;
  overall_confidence: number;
}

export interface IngestResponse {
  request_id: string;
  status: string;
  raw_text: string;
  structured_data: StructuredExtraction | null;
  processed_at: string;
}

export interface QrGenerateResponse {
  qr_code_base64: string;
  token: string;
  expires_at: string;
  verify_url: string;
}

/* ------------------------------------------------------------------ */
/*  Axios instance                                                     */
/* ------------------------------------------------------------------ */

const apiClient = axios.create({
  baseURL: "http://localhost:8000/api/v1",
  timeout: 30_000,
});

/* ------------------------------------------------------------------ */
/*  Helper functions                                                   */
/* ------------------------------------------------------------------ */

/**
 * Upload one or more files (images / voice notes) to the ingest endpoint.
 * Accepts arrays so a single FormData POST can carry all payloads.
 */
export async function uploadFiles(
  files: (File | Blob)[],
  notes: string = "",
  fileTypes: ("ledger_image" | "voice_note")[] = [],
): Promise<IngestResponse> {
  const fd = new FormData();

  files.forEach((file, i) => {
    const filename =
      file instanceof File
        ? file.name
        : `voice_clip_${i + 1}.webm`;
    fd.append("files", file, filename);
  });

  fd.append("notes", notes);

  // Optionally attach source_type hints if the backend expects them
  fileTypes.forEach((t) => fd.append("source_types", t));

  const { data } = await apiClient.post<IngestResponse>("/ingest/upload", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

/**
 * Upload a single file with an explicit source type.
 */
export async function uploadFile(
  file: File | Blob,
  sourceType: "ledger_image" | "voice_note",
): Promise<IngestResponse> {
  return uploadFiles([file], "", [sourceType]);
}

/**
 * Submit text-only notes (no files) to the ingest endpoint.
 */
export async function submitText(notes: string): Promise<IngestResponse> {
  const fd = new FormData();
  fd.append("notes", notes);

  const { data } = await apiClient.post<IngestResponse>("/ingest/upload", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

/**
 * Generate a cryptographic QR code for a processed cash-flow dossier.
 */
export async function generateQR(
  cashFlowId: string,
  expiryMinutes: number = 4320,
): Promise<QrGenerateResponse> {
  const { data } = await apiClient.post<QrGenerateResponse>("/qrcode/generate", {
    cash_flow_id: cashFlowId,
    expiry_minutes: expiryMinutes,
  });
  return data;
}

export interface QrVerifyResponse {
  cash_flow_id: string;
  cash_flow_data: Record<string, any>;
}

export interface LoanExecutionRequest {
  token: string;
  officer_id: string;
  approved_amount: number;
  interest_rate: number;
  interview_notes: string[];
}

export interface LoanExecutionResponse {
  contract_id: string;
  lankasign_cert_hash: string;
  timestamp: string;
  ncgi_guarantee_ref: string;
  status: string;
}

/**
 * Verify a QR token and retrieve the linked cash-flow dossier data.
 */
export async function verifyQR(token: string): Promise<QrVerifyResponse> {
  const { data } = await apiClient.get<QrVerifyResponse>(`/qrcode/verify/${encodeURIComponent(token)}`);
  return data;
}

/**
 * Execute a loan approval with LankaSign digital signature and NCGI guarantee.
 */
export async function executeLoan(request: LoanExecutionRequest): Promise<LoanExecutionResponse> {
  const { data } = await apiClient.post<LoanExecutionResponse>("/dossier/execute", request);
  return data;
}

export default apiClient;
