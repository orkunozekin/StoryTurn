"use client";
import { useState } from "react";
import { editionsAction, addEditionAction } from "@/app/book-actions";
import { editionLabel } from "@/lib/book-edition";
import { Button } from "@/components/ui/button";
type Edition = Awaited<ReturnType<typeof editionsAction>>["entries"][number];
export function BookEditions({
  workKey,
  collectionKeys,
}: {
  workKey: string;
  collectionKeys: string[];
}) {
  const [editions, setEditions] = useState<Edition[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [more, setMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [added, setAdded] = useState<string[]>([]);
  async function load() {
    setPending("load");
    setError("");
    try {
      const result = await editionsAction(workKey, offset);
      setEditions((current) => [...current, ...result.entries]);
      setMore(result.hasMore);
      setOffset((current) => current + 10);
      setLoaded(true);
      setExpanded(true);
    } catch {
      setError("Could not load editions. Please retry.");
    } finally {
      setPending(null);
    }
  }
  return (
    <div className="col-span-full space-y-2">
      {!loaded && (
        <Button
          size="sm"
          variant="secondary"
          disabled={!!pending}
          loading={pending === "load"}
          onClick={() => void load()}
        >
          {pending ? "Loading editions…" : "Choose edition"}
        </Button>
      )}
      {loaded && (
        <Button
          size="sm"
          variant="secondary"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Collapse editions" : "Show editions"}
        </Button>
      )}
      {expanded && loaded && !editions.length && (
        <p className="text-sm text-muted-foreground">
          No editions found. Try the ISBN scanner.
        </p>
      )}
      {expanded &&
        editions.map((edition) => {
          const collected = [...collectionKeys, ...added].includes(edition.editionKey);
          return (
            <div
              key={edition.editionKey}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium break-words">{edition.title}</p>
                {editionLabel(edition) && (
                  <p className="text-xs text-muted-foreground break-words">
                    {editionLabel(edition)}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="shrink-0"
                disabled={collected || !!pending}
                loading={pending === edition.editionKey}
                onClick={async () => {
                  setPending(edition.editionKey);
                  setError("");
                  try {
                    const result = await addEditionAction(edition.editionKey);
                    if (result.ok)
                      setAdded((current) => [...current, edition.editionKey]);
                    else setError(result.error);
                  } catch {
                    setError("Could not add edition. Please retry.");
                  } finally {
                    setPending(null);
                  }
                }}
              >
                {pending === edition.editionKey
                  ? "Adding…"
                  : collected
                    ? "In collection"
                    : "Add to library"}
              </Button>
            </div>
          );
        })}
      {expanded && more && (
        <Button
          size="sm"
          variant="outline"
          disabled={!!pending}
          loading={pending === "load"}
          onClick={() => void load()}
        >
          More editions
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
