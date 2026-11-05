// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as store from "@/lib/demo/store";
import { ScheduleWizard, type ScheduleDefaults } from "@/components/schedule-wizard";

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
import SchedulePage from "@/app/(app)/schedule/page";

beforeEach(() => store.resetDemoStore());
afterEach(() => cleanup());

async function schedulePageHtml() {
  return renderToStaticMarkup(await SchedulePage({ searchParams: Promise.resolve({}) }));
}

describe("schedule page", () => {
  it("summarizes the saved rotation for owners", async () => {
    const html = await schedulePageHtml();
    expect(html).toContain("Your rotation");
    expect(html).toContain("Take turns every night");
    expect(html).toContain("Edit schedule");
  });

  it("describes a saved weekend reader", async () => {
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
        "mem_nana",
      ],
    });
    expect(await schedulePageHtml()).toContain(
      "Take turns on weeknights · Nana reads on weekends",
    );
  });

  it("offers to create a schedule when there is none", async () => {
    store.getDemoState().schedules = [];
    const html = await schedulePageHtml();
    expect(html).toContain("No schedule yet");
    expect(html).toContain("Create schedule");
  });
});

describe("schedule wizard", () => {
  const readers = [
    { id: "alex", displayName: "Alex", hint: "(Parent)" },
    { id: "jordan", displayName: "Jordan", hint: "(Parent)" },
    { id: "nana", displayName: "Nana", hint: "(Grandparent)" },
  ];
  const ROTATE_ALL = Array.from({ length: 7 }, () => "rotate");
  const baseDefaults: ScheduleDefaults = {
    pool: ["alex", "jordan"],
    plan: ROTATE_ALL,
    startDate: "2026-11-02",
    timeLocal: "19:30",
    booksPerSession: 3,
    assignRandomBooks: true,
  };

  function setup(defaults: Partial<ScheduleDefaults> = {}, editing = false) {
    const action = vi.fn(async (data: FormData) => {
      void data;
    });
    const user = userEvent.setup();
    render(
      <ScheduleWizard
        action={action}
        readers={readers}
        defaults={{ ...baseDefaults, ...defaults }}
        today="2026-11-02"
        editing={editing}
      />,
    );
    return { action, user };
  }

  const steps = () => screen.getByRole("navigation", { name: "Schedule steps" });
  const goToStep = (user: ReturnType<typeof userEvent.setup>, name: RegExp) =>
    user.click(within(steps()).getByRole("button", { name }));
  const previewReaders = () =>
    within(screen.getByRole("list", { name: "Next two weeks" }))
      .getAllByRole("listitem")
      .map((item) => item.querySelector(".weekday-preview__reader")!.textContent);
  const posted = (action: ReturnType<typeof setup>["action"]) =>
    action.mock.calls.at(-1)![0] as FormData;

  it("starts with readers and lets every step be opened from the rail", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Create schedule" }));
    expect(screen.getByRole("heading", { name: "Who reads?" })).toBeInTheDocument();
    const rail = within(steps()).getAllByRole("button");
    expect(rail.map((step) => step.getAttribute("aria-label"))).toEqual([
      "Readers",
      "Nights",
      "Start date",
      "First reader",
      "Review",
    ]);
    expect(rail[0]).toHaveAttribute("aria-current", "step");

    await goToStep(user, /^Review/);
    expect(screen.getByRole("heading", { name: "Nights assigned" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "How book assignments work" }),
    ).toBeInTheDocument();
    await goToStep(user, /^Start date/);
    expect(screen.getByLabelText("Start date", { selector: "input" })).toHaveValue(
      "2026-11-02",
    );
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByRole("heading", { name: "How are nights shared?" }),
    ).toBeInTheDocument();
  });

  it("saves a pattern with a weekend reader and the chosen first reader", async () => {
    const { action, user } = setup();
    await user.click(screen.getByRole("button", { name: "Create schedule" }));
    await user.click(screen.getByRole("checkbox", { name: /Nana/ }));
    await user.click(screen.getByRole("button", { name: /Next/ }));

    await user.click(
      screen.getByRole("radio", {
        name: /Take turns on weeknights, one reader on weekends/,
      }),
    );
    await user.selectOptions(screen.getByLabelText("Weekend reader"), "nana");
    await user.click(screen.getByRole("button", { name: /Next/ }));
    await user.click(screen.getByRole("button", { name: /Next/ }));

    await user.click(screen.getByRole("radio", { name: "Jordan" }));
    expect(screen.getByText("Jordan → Nana → Alex")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Next/ }));

    // 2026-11-02 is a Monday: weeknights rotate from Jordan, the weekend is Nana's.
    expect(previewReaders().slice(0, 7)).toEqual([
      "Jordan",
      "Nana",
      "Alex",
      "Jordan",
      "Nana",
      "Nana",
      "Nana",
    ]);
    await user.click(screen.getByRole("button", { name: "Save schedule" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    const data = posted(action);
    expect(data.getAll("readers")).toEqual(["jordan", "nana", "alex"]);
    expect([0, 1, 2, 3, 4, 5, 6].map((day) => data.get(`weekday${day}`))).toEqual([
      "rotate",
      "rotate",
      "rotate",
      "rotate",
      "rotate",
      "nana",
      "nana",
    ]);
    expect(data.get("startDate")).toBe("2026-11-02");
    expect(data.get("timeLocal")).toBe("19:30");
    expect(data.get("booksPerSession")).toBe("3");
    expect(data.get("assignRandomBooks")).toBe("on");
    // Saved in the device's timezone, without asking.
    expect(data.get("timezone")).toBeTruthy();
    // The dialog closes after saving.
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Nights assigned" })).toBeNull(),
    );
  });

  it("assigns days by hand", async () => {
    const { action, user } = setup();
    await user.click(screen.getByRole("button", { name: "Create schedule" }));
    await goToStep(user, /^Nights/);
    await user.click(screen.getByRole("radio", { name: /Assign days/ }));
    await user.selectOptions(screen.getByLabelText("Who reads on Saturday"), "nana");
    await goToStep(user, /^Review/);
    expect(previewReaders().slice(0, 7)).toEqual([
      "Alex",
      "Jordan",
      "Alex",
      "Jordan",
      "Alex",
      "Nana",
      "Jordan",
    ]);
    await user.click(screen.getByRole("button", { name: "Save schedule" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(posted(action).get("weekday5")).toBe("nana");
    expect(posted(action).get("weekday6")).toBe("rotate");
  });

  it("opens an edit on the saved hand-picked week", async () => {
    const { user } = setup(
      { plan: ["rotate", "alex", "rotate", "rotate", "rotate", "rotate", "rotate"] },
      true,
    );
    await user.click(screen.getByRole("button", { name: "Edit schedule" }));
    expect(
      within(steps()).getByRole("button", { name: "Review (done)" }),
    ).toBeInTheDocument();
    await goToStep(user, /^Nights/);
    expect(screen.getByRole("radio", { name: /Assign days/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByLabelText("Who reads on Tuesday")).toHaveValue("alex");
  });

  it("sends the user back to the readers step instead of saving an empty rotation", async () => {
    const { action, user } = setup();
    await user.click(screen.getByRole("button", { name: "Create schedule" }));
    await user.click(screen.getByRole("checkbox", { name: /Alex/ }));
    await user.click(screen.getByRole("checkbox", { name: /Jordan/ }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Add someone to the rotation or pick a reader for every night",
    );
    await goToStep(user, /^Review/);
    await user.click(screen.getByRole("button", { name: "Save schedule" }));
    expect(screen.getByRole("heading", { name: "Who reads?" })).toBeInTheDocument();
    expect(within(steps()).getByRole("button", { name: "Readers" })).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(action).not.toHaveBeenCalled();
  });
});
