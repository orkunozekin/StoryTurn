import { afterEach, expect, it, vi } from "vitest";

const requestHeaders = vi.hoisted(() => ({ current: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders.current }));

import { requestOrigin } from "@/lib/request-origin";

afterEach(() => vi.unstubAllEnvs());

const withHeaders = (init: Record<string, string>) => {
  requestHeaders.current = new Headers(init);
};

it("returns a Vercel preview to its own host", async () => {
  withHeaders({
    host: "internal.vercel",
    "x-forwarded-host": "story-turn-git-feature-team.vercel.app",
    "x-forwarded-proto": "https",
  });
  expect(await requestOrigin()).toBe("https://story-turn-git-feature-team.vercel.app");
});

it("uses http for localhost and https for other hosts without a forwarded proto", async () => {
  withHeaders({ host: "localhost:3456" });
  expect(await requestOrigin()).toBe("http://localhost:3456");
  withHeaders({ host: "www.storyturn.app" });
  expect(await requestOrigin()).toBe("https://www.storyturn.app");
});

it("takes the first value of a forwarded list and ignores unknown protocols", async () => {
  withHeaders({
    "x-forwarded-host": "www.storyturn.app, proxy.internal",
    "x-forwarded-proto": "javascript",
  });
  expect(await requestOrigin()).toBe("https://www.storyturn.app");
});

it("falls back to the configured app URL when the request has no host", async () => {
  vi.stubEnv("VERCEL_ENV", undefined);
  vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", undefined);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.storyturn.app");
  withHeaders({});
  expect(await requestOrigin()).toBe("https://www.storyturn.app");
});
