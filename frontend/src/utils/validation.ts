/**
 * Standard client-side validation utilities for the Phygital platform.
 * Conforms to Sri Lanka National Identity Card (NIC) standards and CBSA/NCGI banking standards.
 */

export interface ValidationResult<T = void> {
  isValid: boolean;
  error?: string;
  data?: T;
}

export interface NicValidationResult {
  isValid: boolean;
  format: "old" | "new" | null;
  gender: "male" | "female" | null;
  normalized: string;
  error?: string;
}

/**
 * Validate Sri Lankan National Identity Card (NIC).
 * - Old format: 9 digits followed by 'V' or 'X' (e.g. 896543456V).
 * - New format: 12 digits (e.g. 198965434567).
 * - Day-code: 1-366 (Male), 501-866 (Female).
 */
export function validateNIC(raw: string): NicValidationResult {
  const nic = raw.trim().toUpperCase();

  if (!nic) {
    return { isValid: false, format: null, gender: null, normalized: "", error: "NIC is required." };
  }

  let format: "old" | "new" | null = null;
  let dayCode = 0;

  if (nic.length === 10 && /^\d{9}[VX]$/.test(nic)) {
    format = "old";
    dayCode = parseInt(nic.substring(2, 5), 10);
  } else if (nic.length === 12 && /^\d{12}$/.test(nic)) {
    format = "new";
    dayCode = parseInt(nic.substring(4, 7), 10);
  } else {
    return {
      isValid: false,
      format: null,
      gender: null,
      normalized: nic,
      error: "NIC must be 9 digits followed by V/X (old format) or 12 digits (new format).",
    };
  }

  let gender: "male" | "female" | null = null;
  if (dayCode >= 501 && dayCode <= 866) {
    gender = "female";
  } else if (dayCode >= 1 && dayCode <= 366) {
    gender = "male";
  } else {
    return {
      isValid: false,
      format,
      gender: null,
      normalized: nic,
      error: "Invalid birth day-code in NIC.",
    };
  }

  return {
    isValid: true,
    format,
    gender,
    normalized: nic,
  };
}

/**
 * Validate and normalize a Sri Lankan mobile number.
 * Accepts formats: 07XXXXXXXX, +947XXXXXXXX, 947XXXXXXXX.
 * Normalizes to standard 10-digit format: 07XXXXXXXX.
 */
export function validateSriLankanPhone(raw: string): ValidationResult<string> {
  const cleaned = raw.trim().replace(/[\s-]/g, "");

  if (!cleaned) {
    return { isValid: false, error: "Phone number is required." };
  }

  // Regex matching 07XXXXXXXX, +947XXXXXXXX, or 947XXXXXXXX
  const match = cleaned.match(/^(?:\+?94|0)?(7\d{8})$/);
  if (!match) {
    return {
      isValid: false,
      error: "Phone number must be a 10-digit Sri Lankan mobile number starting with 07 (e.g. 0771234567).",
    };
  }

  const normalized = `0${match[1]}`;
  return {
    isValid: true,
    data: normalized,
  };
}

/**
 * Validate borrower full name.
 * Length 2-100 chars, letters, spaces, dots, hyphens, and apostrophes.
 */
export function validateFullName(raw: string): ValidationResult<string> {
  const trimmed = raw.trim();

  if (!trimmed) {
    return { isValid: false, error: "Full name is required." };
  }

  if (trimmed.length < 2) {
    return { isValid: false, error: "Full name must be at least 2 characters." };
  }

  if (trimmed.length > 100) {
    return { isValid: false, error: "Full name cannot exceed 100 characters." };
  }

  // Unicode letters, dots, hyphens, spaces, apostrophes
  const validChars = /^[\p{L}\s.'-]+$/u;
  if (!validChars.test(trimmed)) {
    return { isValid: false, error: "Full name contains invalid characters." };
  }

  return { isValid: true, data: trimmed };
}

/**
 * Validate password.
 * Minimum 6 characters (up to 128 chars).
 */
export function validatePassword(password: string): ValidationResult<string> {
  if (!password) {
    return { isValid: false, error: "Password is required." };
  }

  if (password.length < 6) {
    return { isValid: false, error: "Password must be at least 6 characters." };
  }

  if (password.length > 128) {
    return { isValid: false, error: "Password cannot exceed 128 characters." };
  }

  return { isValid: true, data: password };
}

/**
 * Validate transaction amount in LKR.
 * Must be a positive finite number, max 100,000,000 LKR, max 2 decimal places.
 */
export function validateAmount(raw: string | number): ValidationResult<number> {
  const str = String(raw).trim();

  if (!str) {
    return { isValid: false, error: "Amount is required." };
  }

  const num = Number(str);
  if (!Number.isFinite(num) || isNaN(num)) {
    return { isValid: false, error: "Please enter a valid numeric amount." };
  }

  if (num <= 0) {
    return { isValid: false, error: "Amount must be greater than zero." };
  }

  if (num > 100_000_000) {
    return { isValid: false, error: "Amount exceeds maximum limit of LKR 100,000,000." };
  }

  // Check decimal places
  const parts = str.split(".");
  if (parts.length > 1 && parts[1].length > 2) {
    return { isValid: false, error: "Amount cannot have more than 2 decimal places." };
  }

  return { isValid: true, data: Math.round(num * 100) / 100 };
}

/**
 * Validate transaction description.
 * Length between 1 and 500 characters.
 */
export function validateDescription(raw: string): ValidationResult<string> {
  const trimmed = raw.trim();

  if (!trimmed) {
    return { isValid: false, error: "Description is required." };
  }

  if (trimmed.length > 500) {
    return { isValid: false, error: "Description cannot exceed 500 characters." };
  }

  return { isValid: true, data: trimmed };
}

/**
 * Validate 6-digit OTP code.
 */
export function validateOtpCode(raw: string): ValidationResult<string> {
  const trimmed = raw.trim();

  if (!trimmed) {
    return { isValid: false, error: "OTP code is required." };
  }

  if (!/^\d{6}$/.test(trimmed)) {
    return { isValid: false, error: "OTP code must be exactly 6 numeric digits." };
  }

  return { isValid: true, data: trimmed };
}

/**
 * Validate Bank Verification Code.
 * Standard format: PHYG-XXXX-XXXX (8 alphanumeric characters).
 */
export function validateVerificationCode(raw: string): ValidationResult<string> {
  // Strip 'phyg-', hyphens, spaces
  const cleaned = raw.replace(/^phyg-/i, "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

  if (cleaned.length !== 8) {
    return {
      isValid: false,
      error: "Verification code must be 8 alphanumeric characters (e.g. PHYG-XXXX-XXXX).",
    };
  }

  const formatted = `PHYG-${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}`;
  return { isValid: true, data: formatted };
}
