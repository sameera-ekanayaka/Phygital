/**
 * Centralized Axios client for the Phygital backend API.
 * Provides typed helper functions for ingest upload and QR code generation.
 */
import axios from "axios";

const BORROWER_TOKEN_KEY = "phygital_borrower_token";
const OFFICER_TOKEN_KEY = "phygital_access_token";

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

export interface ExtractedTransactionItem {
  transaction_type: "business_revenue" | "business_expense" | "personal_expense";
  amount: number;
  category: string;
  description: string;
  confidence_score?: number;
  detected_language?: string;
}

export interface IngestExtractionResponse {
  transactions: ExtractedTransactionItem[];
  raw_transcript: string;
  processing_time_ms: number;
  triangulation_hints: string[];
}

export interface IngestResponse {
  request_id: string;
  status: string;
  raw_text: string;
  structured_data: StructuredExtraction | null;
  ai_extraction: IngestExtractionResponse | null;
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

export interface BorrowerRegisterResponse {
  borrower_id: string;
  message: string;
  otp_hint?: string;
}

export interface BorrowerLoginResponse {
  access_token: string;
  token_type: string;
  borrower_name: string;
}

export interface OtpVerifyResponse {
  verified: boolean;
  message: string;
}

export interface BorrowerProfileResponse {
  name: string;
  phone: string;
  nic_masked: string;
  verified: boolean;
}

export interface TransactionSessionItem {
  request_id: string;
  raw_text: string;
  structured_data: Record<string, unknown> | null;
  processed_at: string;
}

export interface TransactionSummaryResponse {
  session_id: string;
  transaction_count: number;
  total_revenue: number;
  total_expenses: number;
  total_personal: number;
  business_name: string;
  items: TransactionSessionItem[];
}

export interface GenerateCodeResponse {
  verification_code: string;
  token: string;
  expires_at: string;
}

export interface TransactionCreateRequest {
  amount: number;
  transaction_type: "business_revenue" | "business_expense" | "personal_expense";
  category: string;
  description: string;
  notes?: string;
}

export interface TransactionUpdateRequest {
  amount?: number;
  transaction_type?: "business_revenue" | "business_expense" | "personal_expense";
  category?: string;
  description?: string;
  notes?: string;
}

export interface TransactionRecord {
  id: string;
  amount: number;
  transaction_type: "business_revenue" | "business_expense" | "personal_expense";
  category: string;
  description: string;
  notes: string | null;
  source: "manual" | "ai_upload";
  confidence_score: number;
  created_at: string;
}

export interface TransactionListResponse {
  items: TransactionRecord[];
  total_count: number;
  total_revenue: number;
  total_expenses: number;
  total_personal: number;
  net_income: number;
}

export interface MonthlySummaryItem {
  month: string;
  revenue: number;
  expenses: number;
  personal: number;
  net_income: number;
  count: number;
}

export interface MonthlySummaryResponse {
  months: MonthlySummaryItem[];
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
  const isBorrowerPath = window.location.pathname.startsWith("/borrower");
  const tokenKey = isBorrowerPath ? BORROWER_TOKEN_KEY : OFFICER_TOKEN_KEY;
  const token = localStorage.getItem(tokenKey);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const path = window.location.pathname;
      if (path.startsWith("/borrower") && !path.includes("/borrower/login") && !path.includes("/borrower/register")) {
        localStorage.removeItem(BORROWER_TOKEN_KEY);
        window.location.href = "/borrower/login";
      } else if (path.startsWith("/bank") && !path.includes("/bank/login")) {
        localStorage.removeItem(OFFICER_TOKEN_KEY);
        window.location.href = "/bank/login";
      }
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

export async function registerBorrower(data: {
  name: string;
  phone: string;
  nic: string;
  password: string;
  liya_shakthi_member?: boolean;
}): Promise<BorrowerRegisterResponse> {
  const { data: res } = await apiClient.post<BorrowerRegisterResponse>("/borrower-auth/register", data);
  return res;
}

export async function verifyOtp(
  phone: string,
  otpCode: string,
): Promise<OtpVerifyResponse> {
  const { data: res } = await apiClient.post<OtpVerifyResponse>("/borrower-auth/verify-otp", {
    phone,
    otp_code: otpCode,
  });
  return res;
}

export async function loginBorrower(
  identifier: string,
  password: string,
): Promise<BorrowerLoginResponse> {
  const { data: res } = await apiClient.post<BorrowerLoginResponse>("/borrower-auth/login", {
    identifier,
    password,
  });
  return res;
}

export async function getBorrowerProfile(): Promise<BorrowerProfileResponse> {
  const { data: res } = await apiClient.get<BorrowerProfileResponse>("/borrower-auth/me");
  return res;
}

export async function getTransactionSummary(): Promise<TransactionSummaryResponse> {
  const { data: res } = await apiClient.get<TransactionSummaryResponse>("/transactions/summary");
  return res;
}

export async function fetchTransactions(
  params?: { type?: string; month?: string },
): Promise<TransactionListResponse> {
  const { data: res } = await apiClient.get<TransactionListResponse>("/transactions/", { params });
  return res;
}

export const getTransactions = fetchTransactions;

export async function generateDossier(
  payload?: DossierGenerateRequest,
): Promise<GenerateCodeResponse> {
  if (payload && payload.transactions && payload.transactions.length > 0) {
    const { data: res } = await apiClient.post<DossierGenerateResponse>("/dossier/generate", payload);
    return {
      verification_code: res.verification_code,
      token: (res as any).token || "",
      expires_at: res.code_expires_at,
    };
  }
  const { data: res } = await apiClient.post<GenerateCodeResponse>("/transactions/generate-code");
  return res;
}

export const generateSessionCode = generateDossier;
export const generateReport = generateDossier;

export async function clearTransactionSession(): Promise<{ message: string }> {
  const { data: res } = await apiClient.delete<{ message: string }>("/transactions/session");
  return res;
}

export async function createTransaction(
  data: TransactionCreateRequest,
): Promise<TransactionRecord> {
  const { data: res } = await apiClient.post<TransactionRecord>("/transactions/", data);
  return res;
}

export async function getTransaction(id: string): Promise<TransactionRecord> {
  const { data: res } = await apiClient.get<TransactionRecord>(`/transactions/${id}`);
  return res;
}

export async function updateTransaction(
  id: string,
  data: TransactionUpdateRequest,
): Promise<TransactionRecord> {
  const { data: res } = await apiClient.put<TransactionRecord>(`/transactions/${id}`, data);
  return res;
}

export async function deleteTransaction(id: string): Promise<void> {
  await apiClient.delete(`/transactions/${id}`);
}

export async function getMonthlySummary(): Promise<MonthlySummaryResponse> {
  const { data: res } = await apiClient.get<MonthlySummaryResponse>("/transactions/monthly-summary");
  return res;
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
  onUploadProgress?: (progress: number) => void,
): Promise<IngestResponse> {
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File "${(file as File).name ?? "upload"}" exceeds the 10 MB size limit.`);
    }
  }

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
    timeout: 120_000,
    onUploadProgress: onUploadProgress
      ? (event) => {
          const percent = event.total ? Math.round((event.loaded / event.total) * 100) : 0;
          onUploadProgress(percent);
        }
      : undefined,
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

export interface DossierGenerateRequest {
  transactions?: ExtractedTransactionItem[];
  requested_loan_amount?: number;
  loan_tenor_months?: number;
  merchant_name?: string;
  merchant_id?: string;
  owner_demographics?: Record<string, unknown>;
}

export interface DossierGenerateResponse {
  dossier: Record<string, unknown>;
  verification_code: string;
  code_expires_at: string;
}

export const api = {
  fetchTransactions,
  getTransactions,
  getTransaction,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  generateDossier,
  generateSessionCode,
  generateReport,
  getTransactionSummary,
  getMonthlySummary,
  clearTransactionSession,
  uploadFiles,
  uploadFile,
  submitText,
  registerBorrower,
  verifyOtp,
  loginBorrower,
  getBorrowerProfile,
  loginOfficer,
  generateVerificationCode,
  verifyQR,
  resolveVerificationCode,
  executeLoan,
};

export { BORROWER_TOKEN_KEY, OFFICER_TOKEN_KEY };

export default apiClient;

