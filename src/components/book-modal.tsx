"use client";

import { BookOpen, ExternalLink, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type ShelfOrigin, spineLook, takeShelfOrigin } from "@/lib/shelf";
import type { Book } from "@/lib/types";

const OPEN_MS = 480;
const CLOSE_MS = 360;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
const EASE_IN_OUT = "cubic-bezier(0.65, 0, 0.35, 1)";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Box = { cx: number; cy: number; width: number; height: number; angle: number };

/**
 * The spine is drawn as a horizontal strip turned to match it: an upright spine of
 * w×h becomes an h×w strip rotated (lean - 90)°. A flat book in the phone pile is
 * already horizontal.
 */
const boxFromOrigin = (origin: ShelfOrigin): Box =>
  origin.flat
    ? {
        cx: origin.centerX,
        cy: origin.centerY,
        width: origin.width,
        height: origin.height,
        angle: origin.angle,
      }
    : {
        cx: origin.centerX,
        cy: origin.centerY,
        width: origin.height,
        height: origin.width,
        angle: origin.angle - 90,
      };

const frame = (box: Box, radius: string, scale = 1): Keyframe => ({
  width: `${box.width}px`,
  height: `${box.height}px`,
  borderRadius: radius,
  transform: `translate(${box.cx}px, ${box.cy}px) translate(-50%, -50%) rotate(${box.angle}deg) scale(${scale})`,
});

const liftedFrame = (box: Box, flat: boolean): Keyframe => {
  const lifted = flat
    ? { ...box, cx: box.cx + 24, angle: 0 }
    : { ...box, cy: box.cy - 24, angle: (box.angle - 90) / 2 };
  return { ...frame(lifted, "4px", 1.05), offset: 0.18 };
};

const cardBox = (card: HTMLElement): Box => {
  const r = card.getBoundingClientRect();
  return {
    cx: r.left + r.width / 2,
    cy: r.top + r.height / 2,
    width: r.width,
    height: r.height,
    angle: 0,
  };
};

const metaRows = (book: Book) =>
  [
    book.format ? ["Format", book.format] : null,
    book.publisher ? ["Publisher", book.publisher] : null,
    book.editionYear ? ["Published", book.editionYear] : null,
  ].filter((row): row is [string, string] => row !== null);

export function BookModal({ book }: { book: Book }) {
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const originRef = useRef<ShelfOrigin | null>(null);
  const closingRef = useRef(false);
  const look = spineLook(book);
  const [coverFailed, setCoverFailed] = useState(false);

  useLayoutEffect(() => {
    const card = cardRef.current;
    const ghost = ghostRef.current;
    const scrim = scrimRef.current;
    if (!card || !ghost || !scrim) return;
    const origin = takeShelfOrigin(book.id);
    originRef.current = origin;
    const reduce = prefersReducedMotion();
    scrim.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: reduce ? 1 : 300,
      fill: "both",
    });

    if (!origin || reduce) {
      card.animate(
        [
          { opacity: 0, transform: "translateY(16px) scale(0.98)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: reduce ? 1 : 320, easing: EASE_OUT, fill: "both" },
      );
      card.dataset.landed = "";
      return;
    }

    const start = boxFromOrigin(origin);
    const end = cardBox(card);
    const spine = document.querySelector<HTMLElement>(
      `[data-book-id="${CSS.escape(book.id)}"]`,
    );
    if (spine) spine.style.visibility = "hidden";
    card.style.opacity = "0";
    ghost.hidden = false;
    const flight = ghost.animate(
      [frame(start, "4px"), liftedFrame(start, origin.flat), frame(end, "1.5rem")],
      {
        duration: OPEN_MS,
        easing: EASE_OUT,
        fill: "both",
      },
    );
    flight.finished
      .then(() => {
        card.style.opacity = "";
        ghost.hidden = true;
        card.dataset.landed = "";
      })
      .catch(() => {});
    return () => {
      flight.cancel();
      if (spine) spine.style.visibility = "";
    };
  }, [book.id]);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const card = cardRef.current;
    if (card) delete card.dataset.landed;
    const ghost = ghostRef.current;
    const scrim = scrimRef.current;
    const origin = originRef.current;
    const spine = document.querySelector<HTMLElement>(
      `[data-book-id="${CSS.escape(book.id)}"]`,
    );
    const finish = () => {
      if (spine) spine.style.visibility = "";
      router.back();
    };
    if (!card || !ghost || !scrim || prefersReducedMotion()) return finish();

    scrim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CLOSE_MS, fill: "both" });
    if (!origin || !spine) {
      card
        .animate(
          [{ opacity: 1 }, { opacity: 0, transform: "translateY(12px) scale(0.98)" }],
          {
            duration: 200,
            easing: EASE_IN_OUT,
            fill: "both",
          },
        )
        .finished.then(finish, finish);
      return;
    }
    // Fly back to where the spine is now (the page may have scrolled).
    const box = spine.getBoundingClientRect();
    const target = boxFromOrigin({
      ...origin,
      centerX: box.left + box.width / 2,
      centerY: box.top + box.height / 2,
    });
    const end = cardBox(card);
    card.style.opacity = "0";
    ghost.hidden = false;
    ghost
      .animate([frame(end, "1.5rem"), frame(target, "4px")], {
        duration: CLOSE_MS,
        easing: EASE_IN_OUT,
        fill: "both",
      })
      .finished.then(finish, finish);
  }, [book.id, router]);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [close]);

  const rows = metaRows(book);
  const authors = book.authors.join(", ") || "Unknown author";

  return (
    <div className="fixed inset-0 z-50">
      <div
        ref={scrimRef}
        className="absolute inset-0 bg-[rgba(5,8,18,0.6)] backdrop-blur-[3px]"
        onClick={close}
        aria-hidden="true"
      />
      <div
        ref={ghostRef}
        hidden
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 shadow-2xl"
        style={{ background: look.color }}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
        <div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="book-modal-title"
          className="book-modal pointer-events-auto flex max-h-[min(40rem,calc(100dvh-2rem))] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-card text-card-foreground shadow-2xl"
          style={{ "--spine-color": look.color } as React.CSSProperties}
        >
          <div className="book-modal-cover flex shrink-0 items-center gap-5 p-5">
            {book.coverUrl && !coverFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={book.coverUrl}
                alt={`Cover of ${book.title}`}
                className="book-modal-thumb object-cover"
                onError={() => setCoverFailed(true)}
              />
            ) : (
              <div
                className="book-modal-thumb book-modal-fallback"
                role="img"
                aria-label="No cover image"
              >
                <BookOpen className="size-7" aria-hidden="true" />
                <span>No cover</span>
              </div>
            )}
            <h2
              id="book-modal-title"
              className="font-display min-w-0 text-2xl leading-tight text-balance text-[#fffaf1]"
            >
              {book.title}
            </h2>
          </div>
          <div className="book-modal-body flex min-h-0 flex-col gap-3 overflow-y-auto p-5">
            <p className="font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase">
              {authors}
            </p>
            {rows.length > 0 && (
              <dl className="flex flex-wrap gap-2">
                {rows.map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-full bg-secondary px-3 py-1 text-sm"
                  >
                    <dt className="inline text-muted-foreground">{label}</dt>{" "}
                    <dd className="inline font-bold">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="line-clamp-6 text-[0.95rem] leading-relaxed whitespace-pre-line text-foreground/90">
              {book.description || "No description was saved for this book."}
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              <a
                href={`/library/${book.id}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 font-bold text-primary-foreground transition-transform active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                Full details
              </a>
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-5 font-bold transition-transform active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <X className="size-4" aria-hidden="true" />
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
