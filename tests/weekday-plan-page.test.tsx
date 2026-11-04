// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as store from "@/lib/demo/store";
import { WeekdayPlanFields } from "@/components/weekday-plan-fields";

vi.mock("@/app/actions", () => ({
  saveScheduleAction: vi.fn(),
  deleteScheduleAction: vi.fn(),
  addRandomBooksToUpcomingAction: vi.fn(),
  shuffleUpcomingBooksAction: vi.fn(),
  cascadeInsertAction: vi.fn(),
  swapSessionsAction: vi.fn(),
  requestToReadAction: vi.fn(),
  withdrawReaderRequestAction: vi.fn(),
  decideReaderRequestAction: vi.fn(),
  logoutAction: vi.fn(),
}));
vi.mock("@/lib/plunk", () => ({ sendEmail: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/components/app-nav", () => ({ AppNav: () => null }));
vi.mock("@/components/site-nav", () => ({ SiteNav: () => null }));
vi.mock("@/lib/data", () => ({
  getCurrentUser: store.getCurrentUser,
  getCurrentMember: store.getCurrentMember,
  getFamilyAdmin: store.getFamilyAdmin,
  getFamilySessionPage: store.getFamilySessionPage,
  getUpcomingBookCtaState: store.getUpcomingBookCtaState,
  listFamilyAssignments: store.listFamilyAssignments,
  listFamilySessions: store.listFamilySessions,
  listReaderRequests: store.listReaderRequests,
}));
import SchedulePage from "@/app/schedule/page";

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

beforeEach(() => store.resetDemoStore());
afterEach(() => cleanup());

async function schedulePageHtml() {
  return renderToStaticMarkup(await SchedulePage({ searchParams: Promise.resolve({}) }));
}

describe("schedule page weekday plan", () => {
  it("renders the pool chips, seven weekday selects and the two-week preview", async () => {
    const html = await schedulePageHtml();
    expect(html).toContain("Who&#x27;s in the rotation");
    expect(html).toContain("Every week");
    expect(html).toContain("Next two weeks");
    expect((html.match(/<input type="checkbox"[^>]*name="readers"/g) ?? []).length).toBe(
      store.getFamilyAdmin()!.readers.length,
    );
    DAYS.forEach((day, index) => {
      const select = html.match(
        new RegExp(`<select[^>]*name="weekday${index}"[^>]*>[\\s\\S]*?</select>`),
      )?.[0];
      expect(select, day).toBeDefined();
      expect(select).toContain(`aria-label="Who reads on ${day}"`);
      // The seeded schedule rotates every night.
      expect(select).toMatch(/<option value="rotate" selected="">Rotate<\/option>/);
      expect(select).toContain('<option value="mem_nana">Nana</option>');
    });
    expect((html.match(/class="weekday-preview__night"/g) ?? []).length).toBe(14);
  });

  it("selects a saved fixed reader and marks fixed nights in the preview", async () => {
    const schedule = store.getDemoState().schedules[0]!;
    store.saveSchedule({
      ...schedule,
      weekdayReaders: [
        "rotate",
        "rotate",
        "rotate",
        "rotate",
        "rotate",
        "mem_nana",
        "rotate",
      ],
    });
    const html = await schedulePageHtml();
    const saturday = html.match(
      /<select[^>]*name="weekday5"[^>]*>[\s\S]*?<\/select>/,
    )![0];
    expect(saturday).toContain('<option value="mem_nana" selected="">Nana</option>');
    expect((html.match(/data-fixed="true"/g) ?? []).length).toBe(2);
  });

  it("shows a removed member's weekday as Rotate", async () => {
    const state = store.getDemoState();
    state.schedules[0]!.weekdayReaders = [
      "rotate",
      "rotate",
      "rotate",
      "rotate",
      "rotate",
      "mem_gone",
      "rotate",
    ];
    const html = await schedulePageHtml();
    const saturday = html.match(
      /<select[^>]*name="weekday5"[^>]*>[\s\S]*?<\/select>/,
    )![0];
    expect(saturday).toMatch(/<option value="rotate" selected="">/);
  });

  it("defaults a new schedule's rotation to the parents", async () => {
    store.getDemoState().schedules = [];
    const html = await schedulePageHtml();
    const checked = [
      ...html.matchAll(/<input type="checkbox"([^>]*)name="readers"([^>]*)>/g),
    ]
      .filter((m) => /checked/.test(m[0]))
      .map((m) => /value="([^"]+)"/.exec(m[0])![1]);
    expect(checked.sort()).toEqual(["mem_alex", "mem_jordan"]);
  });
});

describe("live preview", () => {
  const readers = [
    { id: "alex", displayName: "Alex", hint: "(Parent)" },
    { id: "jordan", displayName: "Jordan", hint: "(Parent)" },
    { id: "nana", displayName: "Nana", hint: "(Grandparent)" },
  ];

  function renderFields() {
    render(
      <form aria-label="Schedule">
        <WeekdayPlanFields
          readers={readers}
          defaultPool={["alex", "jordan"]}
          defaultPlan={Array.from({ length: 7 }, () => "rotate")}
          defaultStartDate="2026-11-02"
          today="2026-11-02"
        />
        <input name="startDate" type="date" defaultValue="2026-11-02" />
      </form>,
    );
  }
  const previewReaders = () =>
    within(screen.getByRole("list"))
      .getAllByRole("listitem")
      .map((item) => item.querySelector(".weekday-preview__reader")!.textContent);

  it("updates when a weekday changes and when the pool empties", async () => {
    const user = userEvent.setup();
    renderFields();
    expect(previewReaders().slice(0, 7)).toEqual([
      "Alex",
      "Jordan",
      "Alex",
      "Jordan",
      "Alex",
      "Jordan",
      "Alex",
    ]);

    await user.selectOptions(screen.getByLabelText("Who reads on Saturday"), "nana");
    await waitFor(() =>
      expect(previewReaders().slice(0, 7)).toEqual([
        "Alex",
        "Jordan",
        "Alex",
        "Jordan",
        "Alex",
        "Nana",
        "Jordan",
      ]),
    );
    expect(
      within(screen.getByRole("list"))
        .getAllByRole("listitem")
        .filter((item) => item.dataset.fixed === "true"),
    ).toHaveLength(2);

    await user.click(screen.getByRole("checkbox", { name: /Alex/ }));
    await user.click(screen.getByRole("checkbox", { name: /Jordan/ }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Add someone to the rotation or pick a reader for every night",
      ),
    );
    expect(screen.queryByRole("list")).toBeNull();
  });
});
