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
  ai_extraction: Record<string, unknown> | null;
  processed_at: string;
}

export interface QrGenerateResponse {
  verification_code: string;
  token: string;
  expires_at: string;
}

export interface VerificationResolveResponse {
  cash_flow_id: string;
  cash_flow_data: Record<string, unknown>;
  token: string;
}

/* ------------------------------------------------------------------ */
/*  Axios instance                                                     */
/* ------------------------------------------------------------------ */

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1",
  timeout: 30_000,
});

/* ------------------------------------------------------------------ */
/*  Auth interceptors                                                  */
/* ------------------------------------------------------------------ */

apiClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("phygital_access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !window.location.pathname.includes("/login")) {
      sessionStorage.removeItem("phygital_access_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

/* ------------------------------------------------------------------ */
/*  Auth helpers                                                       */
/* ------------------------------------------------------------------ */

export async function loginOfficer(
  username: string,
  password: string,
): Promise<{ access_token: string; token_type: string }> {
  const fd = new FormData();
  fd.append("username", username);
  fd.append("password", password);
  const { data } = await apiClient.post("/auth/token", fd);
  return data;
}

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

  const { data } = await apiClient.post<IngestResponse>("/ingest/upload", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

/**
 * Upload a single file.
 */
export async function uploadFile(
  file: File | Blob,
): Promise<IngestResponse> {
  return uploadFiles([file], "");
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
 * Generate a verification code for a processed cash-flow dossier.
 */
export async function generateVerificationCode(
  cashFlowId: string,
  expiryMinutes: number = 4320,
): Promise<QrGenerateResponse> {
  const { data } = await apiClient.post<QrGenerateResponse>("/verification/generate", {
    cash_flow_id: cashFlowId,
    expiry_minutes: expiryMinutes,
  });
  return data;
}

/** @deprecated Use `generateVerificationCode` instead. */
export const generateQR = generateVerificationCode;

export interface QrVerifyResponse {
  cash_flow_id: string;
  cash_flow_data: Record<string, unknown>;
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
  ncgi_coverage_percent: number;
  approved_amount: number;
  interest_rate: number;
  officer_id: string;
  merchant_name: string;
}

/**
 * Verify a token and retrieve the linked cash-flow dossier data.
 */
export async function verifyQR(token: string): Promise<QrVerifyResponse> {
  const { data } = await apiClient.get<QrVerifyResponse>(`/verification/verify/${encodeURIComponent(token)}`);
  return data;
}

/**
 * Resolve a human-readable verification code to retrieve dossier data and token.
 */
export async function resolveVerificationCode(code: string): Promise<VerificationResolveResponse> {
  const { data } = await apiClient.get<VerificationResolveResponse>(`/verification/resolve/${encodeURIComponent(code)}`);
  return data;
}

/**
 * Execute a loan approval with LankaSign digital signature and NCGI guarantee.
 */
export async function executeLoan(request: LoanExecutionRequest): Promise<LoanExecutionResponse> {
  const { data } = await apiClient.post<LoanExecutionResponse>("/dossier/execute-loan", request);
  return data;
}

export default apiClient;
