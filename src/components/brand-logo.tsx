import { cn } from "@/lib/utils";

/** Inline so the mark follows the theme tokens in light and dark. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 510 128"
      role="img"
      aria-label="StoryTurn"
      className={cn("h-auto w-48 max-w-full", className)}
    >
      <path
        d="M64 43C51 31 33 28 14 33v62c19-5 37-2 50 10 13-12 31-15 50-10V33c-19-5-37-2-50 10Z"
        fill="var(--card)"
        stroke="var(--foreground)"
        strokeWidth="7"
        strokeLinejoin="round"
      />
      <path d="M64 43C54 32 41 24 27 22v60c14 2 27 10 37 23V43Z" fill="var(--foreground)" />
      <path d="M64 43c10-11 23-19 37-21v60c-14 2-27 10-37 23V43Z" fill="var(--accent)" />
      <path
        d="M64 43c4-13 12-24 23-32v59c-11 8-19 19-23 35V43Z"
        fill="var(--card)"
        stroke="var(--foreground)"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path d="M64 43v62" stroke="var(--foreground)" strokeWidth="5" strokeLinecap="round" />
      <text
        x="148"
        y="85"
        fill="var(--foreground)"
        fontFamily="var(--font-display), Georgia, serif"
        fontSize="64"
        letterSpacing="-1"
      >
        Story
        <tspan fill="var(--primary)">Turn</tspan>
      </text>
    </svg>
  );
}
