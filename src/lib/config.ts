export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function isPlunkConfigured(): boolean {
  return Boolean(process.env.PLUNK_API_KEY);
}

export function isQstashConfigured(): boolean {
  return Boolean(process.env.QSTASH_TOKEN && process.env.QSTASH_CURRENT_SIGNING_KEY);
}

/**
 * The app's public origin, used for auth redirects and shareable links.
 * Vercel preview deployments use their own branch URL so sign-in returns to the
 * preview instead of production. Each variable is read by its literal name so
 * Next.js can inline the NEXT_PUBLIC_ ones into client bundles.
 */
export function appUrl(): string {
  const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV;
  if (vercelEnv === "preview") {
    const host =
      process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL ??
      process.env.VERCEL_BRANCH_URL ??
      process.env.NEXT_PUBLIC_VERCEL_URL ??
      process.env.VERCEL_URL;
    if (host) return `https://${host}`;
  }
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3456";
}

/** Demo mode runs when Supabase is not configured. */
export function isDemoMode(): boolean {
  return process.env.FORCE_DEMO_MODE === "1" || !isSupabaseConfigured();
}
