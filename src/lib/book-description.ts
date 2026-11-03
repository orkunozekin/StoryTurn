const MAX_DESCRIPTION_LENGTH = 4000;

/**
 * Provider blurbs are plain text or light HTML. Store readable text only.
 * Open Library sometimes sends `{ type, value }` instead of a string.
 */
export function plainBookDescription(value: unknown): string | null {
  const raw =
    typeof value === "string"
      ? value
      : value &&
          typeof value === "object" &&
          "value" in value &&
          typeof (value as { value?: unknown }).value === "string"
        ? (value as { value: string }).value
        : null;
  if (!raw) return null;

  const text = raw
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*p\s*>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  if (!text) return null;
  return text.length > MAX_DESCRIPTION_LENGTH
    ? text.slice(0, MAX_DESCRIPTION_LENGTH).trim()
    : text;
}
