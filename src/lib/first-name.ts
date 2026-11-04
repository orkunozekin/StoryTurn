/** First word of a display name, for compact UI like the navbar. */
export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName;
}
