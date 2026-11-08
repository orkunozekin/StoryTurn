"use client";

import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  startScanAction,
  finishScanAction,
  scanBookAction,
  removeBooksAction,
} from "@/app/book-actions";
import { parseScannedBookCode, scannedBookCodeMessage } from "@/lib/isbn";
import { editionLabel, type BookInput } from "@/lib/book-edition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Row = {
  isbn: string;
  status: string;
  book?: BookInput & { id?: string };
  undoable?: boolean;
  retryable?: boolean;
};

const ZXING_NOISE = /MultiFormatReader: non-ReaderException/;
let zxingWarnPatched = false;
let zxingWarnOriginal: typeof console.warn | null = null;

function patchZxingWarnings() {
  if (zxingWarnPatched) return;
  zxingWarnOriginal = console.warn;
  console.warn = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === "string" && ZXING_NOISE.test(first)) return;
    zxingWarnOriginal?.apply(console, args as Parameters<typeof console.warn>);
  };
  zxingWarnPatched = true;
}

function unpatchZxingWarnings() {
  if (!zxingWarnPatched || !zxingWarnOriginal) return;
  console.warn = zxingWarnOriginal;
  zxingWarnOriginal = null;
  zxingWarnPatched = false;
}

export function BookScanner() {
  const [session, setSession] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [isbn, setIsbn] = useState("");
  const [message, setMessage] = useState("");
  const [starting, setStarting] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [camera, setCamera] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<{ stop: () => void } | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const cameraGeneration = useRef(0);
  const queue = useRef<string[]>([]);
  const seen = useRef(new Set<string>());
  const running = useRef<Promise<void> | null>(null);
  const leaving = useRef(false);
  const mounted = useRef(true);
  const afterClose = useRef<(() => void) | null>(null);
  const mutating = useRef(false);
  const [rowBusy, setRowBusy] = useState(false);
  function stopCamera() {
    cameraGeneration.current++;
    controls.current?.stop();
    controls.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    unpatchZxingWarnings();
    if (mounted.current) {
      setCamera(false);
      setCameraStarting(false);
    }
  }
  function patch(code: string, update: Partial<Row>) {
    if (mounted.current)
      setRows((current) =>
        current.map((row) => (row.isbn === code ? { ...row, ...update } : row)),
      );
  }
  function drain() {
    if (running.current) return;
    running.current = (async () => {
      while (queue.current.length && !leaving.current) {
        const code = queue.current.shift()!;
        patch(code, { status: "Looking up and saving…", retryable: false });
        try {
          const result = await scanBookAction(code, sessionRef.current!);
          if (result.ok)
            patch(code, {
              book: result.book,
              status: result.created ? "Added" : "Already collected",
              undoable: result.created,
            });
          else
            patch(code, {
              status: result.error,
              retryable: true,
              book: result.kind === "save" ? result.book : undefined,
            });
        } catch {
          patch(code, { status: "Request failed. Retry this ISBN.", retryable: true });
        }
      }
    })().finally(() => {
      running.current = null;
    });
  }
  function capture(value: string, retry = false) {
    if (leaving.current || !sessionRef.current) return;
    const parsed = parseScannedBookCode(value);
    if (!parsed.ok) {
      setMessage(scannedBookCodeMessage(parsed.reason));
      return;
    }
    const code = parsed.isbn13;
    if (seen.current.has(code) && !retry) return;
    if (queue.current.length >= 5) {
      setMessage("Lookup queue is full. Wait for a book to finish, then scan again.");
      return;
    }
    if (!retry && seen.current.size >= 500) {
      setMessage("Finish this session before scanning more books.");
      return;
    }
    if (!retry) {
      seen.current.add(code);
      setRows((current) => [{ isbn: code, status: "Queued" }, ...current]);
    } else patch(code, { status: "Queued", retryable: false });
    queue.current.push(code);
    setMessage("Got it. Looking up the book…");
    setIsbn("");
    drain();
  }
  async function startCamera() {
    if (cameraStarting || leaving.current) return;
    setCameraStarting(true);
    setCamera(true);
    const generation = ++cameraGeneration.current;
    try {
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] =
        await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
      if (
        generation !== cameraGeneration.current ||
        !sessionRef.current ||
        leaving.current
      )
        return;
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (
        generation !== cameraGeneration.current ||
        !sessionRef.current ||
        leaving.current
      ) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      patchZxingWarnings();
      const reader = new BrowserMultiFormatReader(
        new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]]]),
        { delayBetweenScanAttempts: 250, delayBetweenScanSuccess: 750 },
      );
      const nextControls = await reader.decodeFromStream(
        media,
        video.current!,
        (result) => {
          if (result && generation === cameraGeneration.current)
            capture(result.getText());
        },
      );
      if (generation !== cameraGeneration.current) {
        nextControls.stop();
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      controls.current = nextControls;
      setCameraStarting(false);
      setCamera(true);
      setMessage("Point the rear camera at the ISBN barcode.");
    } catch {
      stopCamera();
      setMessage("Camera unavailable or permission denied. Enter an ISBN below.");
    }
  }
  useEffect(() => {
    mounted.current = true;
    const visibility = () => {
      if (document.hidden) stopCamera();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      mounted.current = false;
      leaving.current = true;
      queue.current = [];
      const activeSession = sessionRef.current;
      if (activeSession) {
        void (running.current ?? Promise.resolve())
          .finally(() => finishScanAction(activeSession))
          .catch(() => {});
      }
      stopCamera();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    const url = location.href;
    history.pushState({ ...history.state, shelfScan: session }, "", url);
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const back = () => {
      history.pushState({ ...history.state, shelfScan: session }, "", url);
      afterClose.current = () => history.go(-2);
      stopCamera();
      setConfirm(true);
    };
    const link = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || event.metaKey || event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      afterClose.current = () => location.assign(anchor.href);
      stopCamera();
      setConfirm(true);
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("popstate", back);
    document.addEventListener("click", link, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("popstate", back);
      document.removeEventListener("click", link, true);
    };
  }, [session]);
  async function finish() {
    if (mutating.current) return;
    leaving.current = true;
    setFinishing(true);
    stopCamera();
    const waiting = [...queue.current];
    waiting.forEach((code) =>
      patch(code, { status: "Not added: session ended", retryable: false }),
    );
    queue.current = [];
    await running.current; // Settle the one in-flight save before ending Undo.
    try {
      await finishScanAction(sessionRef.current!);
      sessionRef.current = null;
      setSession(null);
      setMessage("Scan session ended. Saved books remain in your library.");
      setConfirm(false);
      const next = afterClose.current;
      afterClose.current = null;
      // Let effect cleanup remove navigation guards before changing history.
      setTimeout(() => {
        if (next) next();
        else history.back();
      }, 0);
    } catch {
      leaving.current = false;
      waiting.forEach((code) =>
        patch(code, {
          status: "Not added: finish failed. Retry this ISBN.",
          retryable: true,
        }),
      );
      afterClose.current = null;
      setConfirm(false);
      setMessage("Could not finish the session. Please retry.");
    } finally {
      setFinishing(false);
    }
  }
  async function undo(row: Row) {
    if (!row.book?.id || mutating.current || leaving.current) return;
    mutating.current = true;
    setRowBusy(true);
    try {
      const result = await removeBooksAction([row.book.id], sessionRef.current!);
      patch(row.isbn, {
        status:
          result[0].status === "removed"
            ? "Undone"
            : result[0].status === "referenced"
              ? "Kept: used in a reading session"
              : "Cannot undo this book",
        undoable: false,
      });
    } catch {
      setMessage("Could not undo. Please retry.");
    } finally {
      mutating.current = false;
      setRowBusy(false);
    }
  }
  return (
    <>
      <Button
        loading={starting}
        onClick={async () => {
          setStarting(true);
          setMessage("");
          try {
            const id = await startScanAction();
            if (!mounted.current) {
              await finishScanAction(id);
              return;
            }
            setIsbn("");
            sessionRef.current = id;
            leaving.current = false;
            seen.current.clear();
            queue.current = [];
            setRows([]);
            setSession(id);
          } catch {
            setMessage("Could not start scanning. Please retry.");
          } finally {
            setStarting(false);
          }
        }}
      >
        {starting ? "Starting…" : "Scan your shelf"}
      </Button>
      {!session && message && <p role="status">{message}</p>}
      <Dialog
        open={!!session}
        onOpenChange={(open) => {
          if (!open) {
            stopCamera();
            setConfirm(true);
          }
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogTitle>Scan your shelf</DialogTitle>
          <DialogDescription>
            Matched books save immediately. Undo lasts until this session ends. Camera
            images stay on your device.
          </DialogDescription>
          <video
            ref={video}
            autoPlay
            muted
            playsInline
            className={camera ? "aspect-video w-full rounded bg-black" : "hidden"}
          />
          <Button
            variant="secondary"
            disabled={finishing}
            loading={cameraStarting}
            onClick={() => (camera ? stopCamera() : void startCamera())}
          >
            {camera ? "Pause camera" : "Start camera"}
          </Button>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              capture(isbn);
            }}
          >
            <Input
              aria-label="ISBN"
              placeholder="Enter ISBN-10 or ISBN-13"
              value={isbn}
              onChange={(e) => setIsbn(e.target.value)}
            />
            <Button disabled={finishing} type="submit">
              Add ISBN
            </Button>
          </form>
          <p role="status" aria-live="polite">
            {message}
          </p>
          <p>
            {rows.filter((row) => row.status === "Added").length} added ·{" "}
            {rows.filter((row) => row.status === "Already collected").length} already
            collected · {rows.filter((row) => row.status === "Undone").length} undone ·{" "}
            {rows.filter((row) => row.retryable).length} unresolved
          </p>
          <ul className="space-y-3">
            {rows.map((row) => (
              <li
                key={row.isbn}
                className={`relative flex items-start gap-3 rounded-lg border p-3 ${row.status === "Added" ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30" : ""}`}
              >
                {row.retryable && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="absolute right-1 top-1"
                    aria-label={`Dismiss ${row.book?.title ?? "unknown book"}`}
                    disabled={finishing}
                    onClick={() => {
                      seen.current.delete(row.isbn);
                      setRows((current) =>
                        current.filter((entry) => entry.isbn !== row.isbn),
                      );
                    }}
                  >
                    <X aria-hidden="true" />
                  </Button>
                )}
                {row.book?.coverUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.book.coverUrl}
                    alt=""
                    className="h-16 w-12 shrink-0 rounded object-cover"
                  />
                )}
                <div className="min-w-0 flex-1 space-y-1 break-words pr-7">
                  <p className="font-semibold">{row.book?.title ?? "Unknown book"}</p>
                  {row.book && (
                    <>
                      <p>{row.book.authors.join(", ") || "Unknown author"}</p>
                      {editionLabel(row.book) && (
                        <p className="text-sm text-muted-foreground">
                          {editionLabel(row.book)}
                        </p>
                      )}
                    </>
                  )}
                  <p
                    className={`flex items-center gap-1.5 ${row.status === "Added" ? "font-medium text-green-700 dark:text-green-400" : ""}`}
                  >
                    {row.status === "Added" && (
                      <Check className="size-4 shrink-0" aria-hidden="true" />
                    )}
                    {row.status}
                  </p>
                  {row.undoable && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={rowBusy || finishing}
                      onClick={() => void undo(row)}
                    >
                      Undo
                    </Button>
                  )}
                  {row.status === "Undone" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={finishing}
                      onClick={() => capture(row.isbn, true)}
                    >
                      Add again
                    </Button>
                  )}
                  {row.retryable && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={finishing}
                      onClick={() => capture(row.isbn, true)}
                    >
                      Retry
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Button
            disabled={rowBusy || finishing}
            onClick={() => {
              stopCamera();
              setConfirm(true);
            }}
          >
            Finish scanning
          </Button>
          <Button
            variant="outline"
            disabled={finishing}
            onClick={() => {
              afterClose.current = () => {
                history.back();
                document
                  .querySelector<HTMLInputElement>('[aria-label="Search books"]')
                  ?.focus();
              };
              stopCamera();
              setConfirm(true);
            }}
          >
            Search by title instead
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={confirm}
        onOpenChange={(open) => {
          if (!finishing) {
            setConfirm(open);
            if (!open) afterClose.current = null;
          }
        }}
      >
        <DialogContent showCloseButton={!finishing}>
          <DialogTitle>End this scan session?</DialogTitle>
          <DialogDescription>
            Saved books stay in your library. The current save will finish; queued and
            failed scans will be cleared. Undo will end.
          </DialogDescription>
          <Button
            variant="cancel"
            disabled={finishing}
            onClick={() => {
              afterClose.current = null;
              setConfirm(false);
            }}
          >
            Keep scanning
          </Button>
          <Button disabled={rowBusy} loading={finishing} onClick={() => void finish()}>
            {finishing ? "Finishing current save…" : "End session"}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
