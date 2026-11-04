import { formatRelativeDay } from "@/lib/domain/dates";
import type { BookHistory as History, BookNight } from "@/lib/domain/book-history";
import { cn } from "@/lib/utils";

const PREVIEW_COUNT = 4;

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-border px-4 py-3">
      <span className="font-display text-2xl tabular-nums">{value}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

function NightItem({
  night,
  today,
  timeZone,
  kind,
}: {
  night: BookNight;
  today: string;
  timeZone: string;
  kind: "read" | "upcoming";
}) {
  const who = night.readers.join(" & ") || "No reader";
  return (
    <li className="relative grid grid-cols-[1rem_minmax(0,1fr)] gap-3 py-2 before:absolute before:top-7 before:-bottom-2 before:left-[0.4rem] before:w-0.5 before:bg-border last:before:hidden">
      <span
        aria-hidden="true"
        className={cn(
          "relative z-10 mt-1 size-3.5 rounded-full",
          kind === "read" ? "bg-success" : "border-2 border-accent bg-card",
        )}
      />
      <div className="min-w-0">
        <p className="font-bold">
          {formatRelativeDay(night.scheduledFor, today, timeZone)}
        </p>
        <p className="text-sm text-muted-foreground">
          {who}
          {night.alongside.length > 0 && ` · with ${night.alongside.join(", ")}`}
        </p>
      </div>
    </li>
  );
}

/** Reading life of one book: stats, history and nights it's lined up for. */
export function BookHistory({
  history,
  today,
  timeZone,
}: {
  history: History;
  today: string;
  timeZone: string;
}) {
  const { timesRead, lastRead, topReader, upcoming } = history;
  const preview = history.history.slice(0, PREVIEW_COUNT);
  const rest = history.history.slice(PREVIEW_COUNT);
  const day = (night: BookNight) =>
    formatRelativeDay(night.scheduledFor, today, timeZone);

  return (
    <section
      aria-labelledby="book-history-title"
      className="story-panel reveal mt-6 rounded-2xl p-5 sm:p-8"
    >
      <h2 id="book-history-title" className="font-display text-xl">
        Reading history
      </h2>

      {timesRead === 0 ? (
        <p className="mt-2 text-muted-foreground">Not read yet.</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            value={String(timesRead)}
            label={timesRead === 1 ? "time read" : "times read"}
          />
          {lastRead && <Stat value={day(lastRead)} label="last read" />}
          {topReader &&
            (topReader.names.length === 1 ? (
              <Stat
                value={topReader.names[0] ?? ""}
                label={`reads it most · ${topReader.count} of ${timesRead}`}
              />
            ) : (
              <Stat
                value="Shared"
                label={`${topReader.names.join(" & ")} · ${topReader.count} each`}
              />
            ))}
          <Stat value={upcoming[0] ? day(upcoming[0]) : "—"} label="next lined up" />
        </div>
      )}

      <div className="mt-6 grid gap-8 md:grid-cols-[1.2fr_1fr]">
        {timesRead > 0 && (
          <div>
            <h3 className="font-display text-lg">Nights it was read</h3>
            <ol className="mt-2">
              {preview.map((night) => (
                <NightItem
                  key={night.sessionId}
                  night={night}
                  today={today}
                  timeZone={timeZone}
                  kind="read"
                />
              ))}
            </ol>
            {rest.length > 0 && (
              <details className="group mt-1">
                <summary className="inline-flex min-h-9 cursor-pointer list-none items-center rounded-full border border-input px-4 text-sm font-bold hover:border-ring/60 focus-visible:outline-2 focus-visible:outline-ring group-open:hidden">
                  Show {rest.length} more
                </summary>
                <ol>
                  {rest.map((night) => (
                    <NightItem
                      key={night.sessionId}
                      night={night}
                      today={today}
                      timeZone={timeZone}
                      kind="read"
                    />
                  ))}
                </ol>
              </details>
            )}
          </div>
        )}
        <div>
          <h3 className="font-display text-lg">Coming up</h3>
          {upcoming.length > 0 ? (
            <ol className="mt-2">
              {upcoming.map((night) => (
                <NightItem
                  key={night.sessionId}
                  night={night}
                  today={today}
                  timeZone={timeZone}
                  kind="upcoming"
                />
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Not lined up for any upcoming night.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/** One-line summary for the open-book modal, e.g. "Read 9 times · last on Tuesday". */
export function bookHistorySummary(history: History, today: string, timeZone: string) {
  if (history.timesRead === 0) return "Not read yet";
  const times = history.timesRead === 1 ? "Read once" : `Read ${history.timesRead} times`;
  if (!history.lastRead) return times;
  const day = formatRelativeDay(history.lastRead.scheduledFor, today, timeZone);
  const when = ["Today", "Yesterday"].includes(day) ? day.toLowerCase() : `on ${day}`;
  return `${times} · last ${when}`;
}
