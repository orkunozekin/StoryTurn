"use client";

import { BookOpen, ExternalLink, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type ShelfOrigin, spineLook, takeShelfOrigin } from "@/lib/shelf";
import type { Book } from "@/lib/types";

const OPEN_MS = 300;
const FLIP_MS = 420;
const CLOSE_FLIP_MS = 320;
const CLOSE_MS = 280;
const BOARD_FADE_MS = 160;
const COVER_RADIUS = "4px 14px 14px 4px";
const COVER_OPEN_WIDE = "rotateY(-180deg)";
const COVER_OPEN_PHONE = "rotateY(-105deg)";
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
  return { ...frame(lifted, "4px", 1.04), offset: 0.12 };
};

const isPhone = () => window.matchMedia("(max-width: 639px)").matches;

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
  const coverRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const originRef = useRef<ShelfOrigin | null>(null);
  const closingRef = useRef(false);
  const look = spineLook(book);
  const [coverFailed, setCoverFailed] = useState(false);

  /** Board and pages fade together while the cover swings. */
  const layers = () => [
    ...(cardRef.current?.querySelectorAll<HTMLElement>(
      ".open-book-board, .open-book-spread",
    ) ?? []),
  ];

  useLayoutEffect(() => {
    const card = cardRef.current;
    const cover = coverRef.current;
    const ghost = ghostRef.current;
    const scrim = scrimRef.current;
    if (!card || !cover || !ghost || !scrim) return;
    // Strict Mode re-runs this effect; keep the origin taken on the first pass.
    if (originRef.current?.bookId !== book.id)
      originRef.current = takeShelfOrigin(book.id);
    const origin = originRef.current;
    const reduce = prefersReducedMotion();
    scrim.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: reduce ? 1 : 300,
      fill: "both",
    });

    if (!origin || reduce) {
      card.animate(
        reduce
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [
              { opacity: 0, transform: "translateY(16px) scale(0.98)" },
              { opacity: 1, transform: "none" },
            ],
        { duration: reduce ? 200 : 320, easing: EASE_OUT, fill: "both" },
      );
      card.dataset.phase = "open";
      return;
    }

    const start = boxFromOrigin(origin);
    const end = cardBox(cover);
    const spine = document.querySelector<HTMLElement>(
      `[data-book-id="${CSS.escape(book.id)}"]`,
    );
    if (spine) spine.style.visibility = "hidden";
    card.dataset.phase = "closed";
    cover.style.opacity = "0";
    ghost.hidden = false;
    const running: Animation[] = [];
    const flight = ghost.animate(
      [frame(start, "4px"), liftedFrame(start, origin.flat), frame(end, COVER_RADIUS)],
      { duration: OPEN_MS, easing: EASE_OUT, fill: "both" },
    );
    running.push(flight);
    let cancelled = false;
    flight.finished
      .then(() => {
        if (cancelled) return;
        cover.style.opacity = "";
        ghost.hidden = true;
        card.dataset.phase = "flipping";
        const phone = isPhone();
        for (const layer of layers()) {
          running.push(
            layer.animate([{ opacity: 0 }, { opacity: 1 }], {
              duration: BOARD_FADE_MS,
              easing: EASE_OUT,
              fill: "backwards",
            }),
          );
        }
        const flip = cover.animate(
          phone
            ? [
                { transform: "rotateY(0deg)", opacity: 1 },
                { transform: COVER_OPEN_PHONE, opacity: 0 },
              ]
            : [{ transform: "rotateY(0deg)" }, { transform: COVER_OPEN_WIDE }],
          { duration: FLIP_MS, easing: EASE_IN_OUT },
        );
        running.push(flip);
        return flip.finished.then(() => {
          if (!cancelled) card.dataset.phase = "open";
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      for (const animation of running) animation.cancel();
      if (spine) spine.style.visibility = "";
    };
  }, [book.id]);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const card = cardRef.current;
    const cover = coverRef.current;
    const ghost = ghostRef.current;
    const scrim = scrimRef.current;
    const origin = originRef.current;
    const spine = document.querySelector<HTMLElement>(
      `[data-book-id="${CSS.escape(book.id)}"]`,
    );
    const finish = () => {
      if (spine) {
        spine.style.visibility = "";
        // Return keyboard focus to the book that opened the modal.
        spine.focus({ preventScroll: true });
      }
      router.back();
    };
    // Reduced motion: close instantly (the route change itself is the transition).
    if (!card || !cover || !ghost || !scrim || prefersReducedMotion()) return finish();

    scrim.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: CLOSE_FLIP_MS + CLOSE_MS,
      fill: "both",
    });
    if (!origin || !spine) {
      card
        .animate(
          [{ opacity: 1 }, { opacity: 0, transform: "translateY(12px) scale(0.98)" }],
          { duration: 200, easing: EASE_IN_OUT, fill: "both" },
        )
        .finished.then(finish, finish);
      return;
    }

    // Close the cover over the right page, then fly back to the spine.
    card.dataset.phase = "flipping";
    const phone = isPhone();
    for (const layer of layers()) {
      layer.animate([{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], {
        duration: CLOSE_FLIP_MS,
        fill: "forwards",
      });
    }
    const flip = cover.animate(
      phone
        ? [
            { transform: COVER_OPEN_PHONE, opacity: 0 },
            { transform: "rotateY(0deg)", opacity: 1 },
          ]
        : [{ transform: COVER_OPEN_WIDE }, { transform: "rotateY(0deg)" }],
      { duration: CLOSE_FLIP_MS, easing: EASE_IN_OUT, fill: "forwards" },
    );
    flip.finished
      .then(() => {
        // Fly to where the spine is now (the page may have scrolled).
        const box = spine.getBoundingClientRect();
        const target = boxFromOrigin({
          ...origin,
          centerX: box.left + box.width / 2,
          centerY: box.top + box.height / 2,
        });
        const end = cardBox(cover);
        card.style.opacity = "0";
        ghost.hidden = false;
        return ghost.animate([frame(end, COVER_RADIUS), frame(target, "4px")], {
          duration: CLOSE_MS,
          easing: EASE_IN_OUT,
          fill: "both",
        }).finished;
      })
      .then(finish, finish);
  }, [book.id, router]);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") return close();
      if (event.key !== "Tab") return;
      // Keep focus inside the dialog.
      const focusable = [
        ...(cardRef.current?.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled])",
        ) ?? []),
      ];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      const inside = active instanceof Node && cardRef.current?.contains(active);
      if (event.shiftKey && (active === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
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
          data-phase="open"
          className="open-book pointer-events-auto"
          style={{ "--spine-color": look.color } as React.CSSProperties}
        >
          <div className="open-book-board" aria-hidden="true" />
          <div className="open-book-spread">
            <div className="open-book-page open-book-page--left">
              <div className="open-book-content">
                {book.coverUrl && !coverFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={book.coverUrl}
                    alt={`Cover of ${book.title}`}
                    className="open-book-thumb"
                    onError={() => setCoverFailed(true)}
                  />
                ) : (
                  <div
                    className="open-book-thumb open-book-fallback"
                    role="img"
                    aria-label="No cover image"
                  >
                    <BookOpen className="size-7" aria-hidden="true" />
                    <span>No cover</span>
                  </div>
                )}
              </div>
              <div className="open-book-content flex min-w-0 flex-col gap-2">
                <h2 id="book-modal-title" className="open-book-title">
                  {book.title}
                </h2>
                <p className="open-book-authors">{authors}</p>
              </div>
            </div>
            <div className="open-book-page open-book-page--right">
              {rows.length > 0 ? (
                <dl className="open-book-content flex flex-wrap gap-2">
                  {rows.map(([label, value]) => (
                    <div key={label} className="open-book-pill">
                      <dt className="inline opacity-70">{label}</dt>{" "}
                      <dd className="inline font-bold">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <span className="open-book-content hidden" />
              )}
              <p className="open-book-content open-book-desc">
                {book.description || "No description was saved for this book."}
              </p>
              <div className="open-book-content flex flex-wrap gap-2">
                <a
                  href={`/library/${book.id}`}
                  className="open-book-btn open-book-btn--primary"
                >
                  <ExternalLink className="size-4" aria-hidden="true" />
                  Full details
                </a>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={close}
                  className="open-book-btn open-book-btn--ghost"
                >
                  <X className="size-4" aria-hidden="true" />
                  Close
                </button>
              </div>
            </div>
          </div>
          <div ref={coverRef} className="open-book-cover" aria-hidden="true">
            <div className="open-book-face open-book-face--front">
              <p className="open-book-title">{book.title}</p>
              <p className="mt-3 font-mono text-[0.7rem] tracking-[0.12em] uppercase opacity-80">
                {authors}
              </p>
            </div>
            <div className="open-book-face open-book-face--back" />
          </div>
        </div>
      </div>
    </div>
  );
}
