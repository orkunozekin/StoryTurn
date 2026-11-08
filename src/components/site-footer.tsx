/** App-wide ownership notice shown at the bottom of every page. */
export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 px-4 py-6 text-center text-xs text-muted-foreground">
      {/* The year can differ between server and client render on Dec 31. */}
      <p suppressHydrationWarning>
        © {new Date().getFullYear()}{" "}
        <a
          href="https://studioartemis.io"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-sm underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Studio Artemis LLC
        </a>
        . All rights reserved.
      </p>
    </footer>
  );
}
