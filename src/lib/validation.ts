// ═══════════════════════════════════════════════════════════
// ChurchOS Input Validation — Guards against bad data
// Every user input goes through here before hitting the store.
// ═══════════════════════════════════════════════════════════

/** Parse a positive integer from user input. Returns null if invalid. */
export function parsePositiveInt(value: string | number): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = parseInt(trimmed, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return null;
  // Extra safety: ensure the parsed value equals the string representation
  // (prevents "123abc" from being accepted as 123)
  if (String(parsed) !== trimmed) return null;
  return parsed;
}

/** Parse a non-negative integer (0+). Returns null if invalid. */
export function parseNonNegativeInt(value: string | number): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
  }
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = parseInt(trimmed, 10);
  if (Number.isNaN(parsed) || parsed < 0) return null;
  if (String(parsed) !== trimmed) return null;
  return parsed;
}

/** Parse a non-negative float (0+). Returns null if invalid. */
export function parseNonNegativeFloat(value: string | number): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = parseFloat(trimmed);
  if (Number.isNaN(parsed) || parsed < 0) return null;
  // Allow decimal notation to match: "123", "123.45", "0.50"
  const numStr = String(parsed);
  if (!trimmed.startsWith(numStr) && numStr !== trimmed) return null;
  return parsed;
}

/** Parse a peso amount. Returns null if invalid. */
export function parsePesoAmount(value: string | number): number | null {
  return parseNonNegativeInt(value);
}

/** Sanitize text input — remove dangerous HTML, trim whitespace. */
export function sanitizeText(value: string, maxLength = 500): string {
  if (!value || typeof value !== 'string') return '';
  return value
    .replace(/[<>]/g, '') // Strip HTML tags
    .replace(/javascript:/gi, '') // Strip JS protocols
    .trim()
    .slice(0, maxLength);
}

/** Check if a string has actual content (not just whitespace). */
export function hasContent(value: string): boolean {
  return typeof value === 'string' && /\S/.test(value);
}

/** Validate a fee override reason. Returns error message or null if valid. */
export function validateOverrideReason(reason: string): string | null {
  const trimmed = reason.trim();
  if (!trimmed) return 'Override reason is required.';
  if (!/\S/.test(trimmed)) return 'Override reason cannot be only spaces.';
  if (trimmed.length < 5) return 'Override reason must be at least 5 characters.';
  if (trimmed.length > 500) return 'Override reason must be under 500 characters.';
  return null;
}

/** Validate a name field. Returns error message or null if valid. */
export function validateName(value: string, fieldName: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return `${fieldName} is required.`;
  if (!/\S/.test(trimmed)) return `${fieldName} cannot be only spaces.`;
  if (trimmed.length < 1) return `${fieldName} is required.`;
  if (trimmed.length > 100) return `${fieldName} is too long (max 100 characters).`;
  return null;
}

/** Validate date string is a real date. */
export function validateDate(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const d = new Date(dateStr + 'T00:00:00');
  return !Number.isNaN(d.getTime()) && dateStr.match(/^\d{4}-\d{2}-\d{2}$/) !== null;
}

/** Safe JSON parse with fallback. */
export function safeJsonParse<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/** Safe localStorage getItem + parse. */
export function safeLocalStorageGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Safe localStorage setItem. */
export function safeLocalStorageSet(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
