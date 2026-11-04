import { afterEach, expect, it, vi } from "vitest";
import { appUrl } from "@/lib/config";

afterEach(() => vi.unstubAllEnvs());

const clearVercel = () => {
  for (const name of [
    "VERCEL_ENV",
    "NEXT_PUBLIC_VERCEL_ENV",
    "VERCEL_BRANCH_URL",
    "NEXT_PUBLIC_VERCEL_BRANCH_URL",
    "VERCEL_URL",
    "NEXT_PUBLIC_VERCEL_URL",
  ]) {
    vi.stubEnv(name, undefined);
  }
};

it("uses the configured app URL outside previews", () => {
  clearVercel();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.storyturn.app");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("VERCEL_BRANCH_URL", "story-turn-git-main.vercel.app");
  expect(appUrl()).toBe("https://www.storyturn.app");
});

it("sends preview deployments back to their own branch URL", () => {
  clearVercel();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.storyturn.app");
  vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");
  vi.stubEnv("NEXT_PUBLIC_VERCEL_BRANCH_URL", "story-turn-git-feature.vercel.app");
  vi.stubEnv("NEXT_PUBLIC_VERCEL_URL", "story-turn-abc123.vercel.app");
  expect(appUrl()).toBe("https://story-turn-git-feature.vercel.app");
});

it("falls back to the deployment URL, then the app URL, in a preview", () => {
  clearVercel();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.storyturn.app");
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_URL", "story-turn-abc123.vercel.app");
  expect(appUrl()).toBe("https://story-turn-abc123.vercel.app");
  vi.stubEnv("VERCEL_URL", undefined);
  expect(appUrl()).toBe("https://www.storyturn.app");
});
