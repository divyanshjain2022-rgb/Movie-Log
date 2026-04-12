export function normalizeAudiValue(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const simple = trimmed.replace(/\s+/g, " ");
  const prefixed = simple.match(/^(?:audi|screen)\s*[-:#]?\s*([a-z]*\d+[a-z]*)$/i);
  if (prefixed) {
    return normalizeAudiToken(prefixed[1]);
  }

  const bare = simple.match(/^([a-z]*\d+[a-z]*)$/i);
  if (bare) {
    return normalizeAudiToken(bare[1]);
  }

  return simple;
}

function normalizeAudiToken(token: string): string {
  const normalized = token.trim().toUpperCase();
  const numeric = normalized.match(/^0*(\d+)$/);
  if (numeric) {
    return String(Number(numeric[1]));
  }

  const alphaNumeric = normalized.match(/^([A-Z]+)0*(\d+)([A-Z]*)$/);
  if (!alphaNumeric) return normalized;

  const [, prefix, number, suffix] = alphaNumeric;
  const normalizedNumber = String(Number(number));
  return `${prefix}${normalizedNumber}${suffix}`;
}

export function formatAudiDisplay(
  value: string | null | undefined,
  prefix = "Screen"
): string | null {
  const normalized = normalizeAudiValue(value);
  if (!normalized) return null;

  if (/\b(audi|screen)\b/i.test(value || "")) {
    return `${prefix} ${normalized}`;
  }

  if (/^[A-Z]*\d+[A-Z]*$/i.test(normalized)) {
    return `${prefix} ${normalized}`;
  }

  return normalized;
}

export type AudiDefaultsByFormat = Record<string, string>;

export function normalizeAudiDefaultsByFormat(value: unknown): AudiDefaultsByFormat {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const normalizedDefaults: AudiDefaultsByFormat = {};

  for (const [formatId, rawValue] of Object.entries(value as Record<string, unknown>)) {
    if (typeof rawValue !== "string") continue;

    const normalizedAudi = normalizeAudiValue(rawValue);
    if (formatId && normalizedAudi) {
      normalizedDefaults[formatId] = normalizedAudi;
    }
  }

  return normalizedDefaults;
}

export function getAudiDefaultForFormat(
  value: unknown,
  formatId: string | null | undefined
): string | null {
  if (!formatId) return null;

  return normalizeAudiDefaultsByFormat(value)[formatId] || null;
}
