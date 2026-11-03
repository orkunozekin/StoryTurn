"use client";

import { useEffect, useMemo, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import "./save-celebration.css";

const COLORS = ["#f2b45a", "#7fc3a4", "#e7836b", "#ece6d8"] as const;
const SHAPES = ["book", "star", "page"] as const;
const PIECE_COUNT = 14;
export const CELEBRATION_MS = 1100;

export type CelebrationBurst = { id: number; x: number; y: number };

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Deterministic pseudo-random spread so each burst looks a little different. */
function pieces(seed: number) {
  let value = seed * 9301 + 49297;
  const next = () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
  return Array.from({ length: PIECE_COUNT }, (_, index) => {
    const angle = -Math.PI / 2 + (next() - 0.5) * Math.PI * 0.9;
    const distance = 50 + next() * 60;
    return {
      shape: SHAPES[index % SHAPES.length],
      style: {
        "--piece-color": COLORS[index % COLORS.length],
        "--piece-dx": `${Math.round(Math.cos(angle) * distance)}px`,
        "--piece-dy": `${Math.round(Math.sin(angle) * distance)}px`,
        "--piece-rot": `${Math.round((next() - 0.5) * 220)}deg`,
        "--piece-delay": `${Math.round(next() * 120)}ms`,
      } as CSSProperties,
    };
  });
}

/** Renders one burst at a page (document) point, then asks to be removed. */
export function SaveCelebration({
  burst,
  onDone,
}: {
  burst: CelebrationBurst;
  onDone: () => void;
}) {
  const shapes = useMemo(() => pieces(burst.id), [burst.id]);
  useEffect(() => {
    const timer = window.setTimeout(onDone, CELEBRATION_MS);
    return () => window.clearTimeout(timer);
  }, [burst.id, onDone]);
  // Portal to <body> and position in page coordinates, so it stays on the button while
  // the page scrolls and a transformed ancestor can't offset it.
  return createPortal(
    <div
      aria-hidden="true"
      className="save-celebration"
      data-testid="save-celebration"
      style={{ left: burst.x, top: burst.y }}
    >
      {shapes.map((piece, index) => (
        <span
          key={index}
          className="save-celebration__piece"
          data-shape={piece.shape}
          style={piece.style}
        />
      ))}
    </div>,
    document.body,
  );
}
