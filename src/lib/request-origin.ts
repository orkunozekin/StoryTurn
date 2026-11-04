import { headers } from "next/headers";
import { appUrl } from "@/lib/config";

/**
 * Origin of the current request, e.g. "https://story-turn-git-x.vercel.app".
 * Auth redirects use this so sign-in returns to whichever deployment the user is on
 * (production, a Vercel preview, or localhost) without depending on environment
 * variables. Supabase's redirect allow-list still decides which origins are accepted.
 * Falls back to appUrl() when the request carries no host.
 */
export async function requestOrigin(): Promise<string> {
  const list = await headers();
  const host = (list.get("x-forwarded-host") ?? list.get("host"))?.split(",")[0]?.trim();
  if (!host) return appUrl();
  const forwardedProto = list.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const proto =
    forwardedProto === "http" || forwardedProto === "https"
      ? forwardedProto
      : local
        ? "http"
        : "https";
  return `${proto}://${host}`;
}
