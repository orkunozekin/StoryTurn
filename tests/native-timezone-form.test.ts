// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { NativeTimezoneForm } from "@/components/native-timezone-form";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it.each(["America/Chicago", "Asia/Kathmandu", "Pacific/Auckland"])(
  "submits the browser timezone %s without offering a selection",
  async (timezone) => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      timeZone: timezone,
    } as Intl.ResolvedDateTimeFormatOptions);
    const action = vi.fn<(data: FormData) => Promise<void>>(async () => {});
    render(
      createElement(
        NativeTimezoneForm,
        { action },
        createElement("button", { type: "submit" }, "Save schedule"),
      ),
    );
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Save schedule" }));
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(action.mock.calls[0][0].get("timezone")).toBe(timezone);
  },
);
it("prevents saving a server timezone before browser detection", () => {
  const html = renderToStaticMarkup(
    createElement(
      NativeTimezoneForm,
      { action: async () => {} },
      createElement("button", { type: "submit" }, "Save schedule"),
    ),
  );
  const container = document.createElement("div");
  container.innerHTML = html;
  expect(container.querySelector("fieldset")?.disabled).toBe(true);
  expect(container.querySelector<HTMLInputElement>('input[name="timezone"]')?.value).toBe(
    "",
  );
});

it("celebrates only after a successful save and skips it for reduced motion", async () => {
  const user = userEvent.setup();
  const renderForm = (action: (data: FormData) => Promise<void>) =>
    render(
      createElement(
        NativeTimezoneForm,
        { action, celebrate: true, successMessage: "Schedule saved" },
        createElement("button", { type: "submit" }, "Save schedule"),
      ),
    );
  const matchMedia = vi.fn(() => ({ matches: false }) as MediaQueryList);
  vi.stubGlobal("matchMedia", matchMedia);

  renderForm(async () => {
    throw new Error("Nope");
  });
  await user.click(screen.getByRole("button", { name: "Save schedule" }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(document.querySelector('[data-testid="save-celebration"]')).toBeNull();
  cleanup();

  renderForm(async () => {});
  await user.click(screen.getByRole("button", { name: "Save schedule" }));
  await waitFor(() =>
    expect(document.querySelectorAll(".save-celebration__piece").length).toBeGreaterThan(
      8,
    ),
  );
  cleanup();

  matchMedia.mockReturnValue({ matches: true } as MediaQueryList);
  renderForm(async () => {});
  await user.click(screen.getByRole("button", { name: "Save schedule" }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(document.querySelector('[data-testid="save-celebration"]')).toBeNull();
  vi.unstubAllGlobals();
});

it("keeps what the user entered when the save fails", async () => {
  const user = userEvent.setup();
  render(
    createElement(
      NativeTimezoneForm,
      {
        action: async () => {
          throw new Error("Nope");
        },
      },
      createElement("input", {
        name: "timeLocal",
        "aria-label": "Bedtime",
        defaultValue: "19:30",
      }),
      createElement("input", {
        type: "checkbox",
        name: "readers",
        value: "a",
        "aria-label": "Reader A",
        defaultChecked: true,
      }),
      createElement("button", { type: "submit" }, "Save schedule"),
    ),
  );
  const time = screen.getByLabelText("Bedtime") as HTMLInputElement;
  const reader = screen.getByLabelText("Reader A") as HTMLInputElement;
  await waitFor(() => expect(time.disabled).toBe(false));
  await user.clear(time);
  await user.type(time, "20:15");
  await user.click(reader);
  await user.click(screen.getByRole("button", { name: "Save schedule" }));
  await new Promise((resolve) => setTimeout(resolve, 60));
  expect(time.value).toBe("20:15");
  expect(reader.checked).toBe(false);
});
