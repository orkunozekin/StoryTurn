// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BookScanner } from "@/components/book-scanner";
import {
  startScanAction,
  scanBookAction,
  finishScanAction,
  removeBooksAction,
} from "@/app/book-actions";
const decoder = vi.hoisted(() => ({ decode: vi.fn() }));
vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatReader: class {
    decodeFromStream = decoder.decode;
  },
}));
vi.mock("@/app/book-actions", () => ({
  startScanAction: vi.fn(),
  scanBookAction: vi.fn(),
  finishScanAction: vi.fn(),
  removeBooksAction: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const book = {
  id: "book",
  familyId: "family",
  title: "Book",
  authors: [],
  isbn: "9780060775858",
  editionKey: "/books/OL1M",
  coverUrl: null,
  openLibraryKey: "/works/OL1W",
  createdAt: "",
};
async function open() {
  vi.mocked(startScanAction).mockResolvedValue("00000000-0000-0000-0000-000000000001");
  render(createElement(BookScanner));
  fireEvent.click(screen.getByRole("button", { name: "Scan your shelf" }));
  await screen.findByRole("textbox", { name: "ISBN" });
}
function enter(value = "0060775858") {
  fireEvent.change(screen.getByRole("textbox", { name: "ISBN" }), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Add ISBN" }));
}
it("captures normalized ISBN once, waits for persistence, and suppresses camera-style repeats after Undo", async () => {
  let resolve!: (value: Awaited<ReturnType<typeof scanBookAction>>) => void;
  vi.mocked(scanBookAction).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  vi.mocked(removeBooksAction).mockResolvedValue([{ id: "book", status: "removed" }]);
  await open();
  enter();
  enter("9780060775858");
  expect(scanBookAction).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  await act(async () => resolve({ ok: true, book, created: true }));
  fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
  await screen.findByText("Undone");
  enter();
  expect(scanBookAction).toHaveBeenCalledTimes(1);
});
it("does not offer Undo for an existing book and confirms session loss", async () => {
  vi.mocked(scanBookAction).mockResolvedValue({ ok: true, book, created: false });
  vi.mocked(finishScanAction).mockResolvedValue(undefined);
  await open();
  enter();
  await screen.findByText("Already collected");
  expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Finish scanning" }));
  await screen.findByRole("button", { name: "End session" });
  fireEvent.click(screen.getByRole("button", { name: "Keep scanning" }));
  expect(finishScanAction).not.toHaveBeenCalled();
});
it("settles in-flight persistence before ending the session and discards queued books", async () => {
  let resolve!: (value: Awaited<ReturnType<typeof scanBookAction>>) => void;
  vi.mocked(scanBookAction).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  vi.mocked(finishScanAction).mockResolvedValue(undefined);
  await open();
  enter();
  enter("9780804429573");
  fireEvent.click(screen.getByRole("button", { name: "Finish scanning" }));
  fireEvent.click(await screen.findByRole("button", { name: "End session" }));
  expect(finishScanAction).not.toHaveBeenCalled();
  await act(async () => resolve({ ok: true, book, created: true }));
  await waitFor(() => expect(finishScanAction).toHaveBeenCalledTimes(1));
  expect(scanBookAction).toHaveBeenCalledTimes(1);
});
it("keeps failed lookups retryable and rejects unsupported codes without saving", async () => {
  vi.mocked(scanBookAction).mockResolvedValue({
    ok: false,
    error: "No ISBN match. Try title search.",
    kind: "unknown",
  });
  await open();
  enter("12345");
  expect(scanBookAction).not.toHaveBeenCalled();
  enter();
  fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
  await waitFor(() => expect(scanBookAction).toHaveBeenCalledTimes(2));
});

it("blocks reload and browser back while a session is active", async () => {
  await open();
  const reload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(reload);
  expect(reload.defaultPrevented).toBe(true);
  window.dispatchEvent(new PopStateEvent("popstate"));
  await screen.findByRole("button", { name: "Keep scanning" });
  expect(finishScanAction).not.toHaveBeenCalled();
});

it("shows camera denial as a typed-ISBN fallback", async () => {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockRejectedValue(new Error("Denied")) },
  });
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Start camera" }));
  await screen.findByText(
    "Camera unavailable or permission denied. Enter an ISBN below.",
  );
  expect(screen.getByRole("textbox", { name: "ISBN" })).toBeTruthy();
});

it("stops camera tracks and decoding when the page backgrounds", async () => {
  const stopTrack = vi.fn();
  const stopDecoder = vi.fn();
  decoder.decode.mockResolvedValue({ stop: stopDecoder });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }),
    },
  });
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Start camera" }));
  await screen.findByRole("button", { name: "Pause camera" });
  await waitFor(() => expect(decoder.decode).toHaveBeenCalledTimes(1));
  Object.defineProperty(document, "hidden", { configurable: true, value: true });
  fireEvent(document, new Event("visibilitychange"));
  expect(stopTrack).toHaveBeenCalled();
  expect(stopDecoder).toHaveBeenCalled();
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
});

it("releases a camera stream that arrives after the scan was closed", async () => {
  let provide!: (stream: { getTracks: () => { stop: () => void }[] }) => void;
  const stop = vi.fn();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockImplementation(
        () =>
          new Promise((done) => {
            provide = done;
          }),
      ),
    },
  });
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Start camera" }));
  await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "Finish scanning" }));
  fireEvent.click(await screen.findByRole("button", { name: "End session" }));
  await waitFor(() => expect(finishScanAction).toHaveBeenCalled());
  await act(async () => provide({ getTracks: () => [{ stop }] }));
  expect(stop).toHaveBeenCalled();
  expect(decoder.decode).not.toHaveBeenCalled();
});

it("retains retryable queued ISBNs when ending the session fails", async () => {
  let resolve!: (value: Awaited<ReturnType<typeof scanBookAction>>) => void;
  vi.mocked(scanBookAction)
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValue({ ok: true, book, created: false });
  vi.mocked(finishScanAction).mockRejectedValueOnce(new Error("Network failure"));
  await open();
  enter();
  enter("9780804429573");
  fireEvent.click(screen.getByRole("button", { name: "Finish scanning" }));
  fireEvent.click(await screen.findByRole("button", { name: "End session" }));
  await act(async () => resolve({ ok: true, book, created: true }));
  await screen.findByText("Could not finish the session. Please retry.");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(scanBookAction).toHaveBeenCalledTimes(2));
  expect(scanBookAction).toHaveBeenLastCalledWith(
    "9780804429573",
    "00000000-0000-0000-0000-000000000001",
  );
});

it("shows newest scans first and lets users dismiss failed lookups", async () => {
  vi.mocked(scanBookAction).mockResolvedValue({
    ok: false,
    error: "No ISBN match. Try title search.",
    kind: "unknown",
  });
  await open();
  const dismissButtons = () =>
    screen.queryAllByRole("button", { name: "Dismiss unknown book" });
  enter();
  await waitFor(() => expect(dismissButtons()).toHaveLength(1));
  enter("9780804429573");
  await waitFor(() => expect(dismissButtons()).toHaveLength(2));
  // Failed rows never show the ISBN itself.
  expect(screen.getAllByRole("listitem")[0].textContent).not.toContain("978");
  expect(screen.getAllByRole("listitem")[0].textContent).toContain("Unknown book");
  // The newest scan is listed first, so this dismisses 9780804429573.
  fireEvent.click(dismissButtons()[0]!);
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  expect(removeBooksAction).not.toHaveBeenCalled();
  // The first scan is still listed, so entering it again is ignored...
  enter();
  expect(scanBookAction).toHaveBeenCalledTimes(2);
  // ...while the dismissed one can be scanned again.
  enter("9780804429573");
  await waitFor(() => expect(dismissButtons()).toHaveLength(2));
  expect(scanBookAction).toHaveBeenCalledTimes(3);
  expect(scanBookAction).toHaveBeenLastCalledWith(
    "9780804429573",
    "00000000-0000-0000-0000-000000000001",
  );
});
