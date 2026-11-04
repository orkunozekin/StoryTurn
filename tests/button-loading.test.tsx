// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { Button } from "@/components/ui/button";

afterEach(cleanup);

it("spins only the submit button that sent the form while its action runs", async () => {
  let finish = () => {};
  const action = () => new Promise<void>((resolve) => (finish = resolve));
  render(
    <form action={action}>
      <Button type="submit" name="decision" value="approve">
        Approve
      </Button>
      <Button type="submit" name="decision" value="decline">
        Decline
      </Button>
    </form>,
  );

  await userEvent.click(screen.getByRole("button", { name: "Decline" }));

  const decline = await screen.findByRole("button", { name: "Decline" });
  expect(decline.getAttribute("aria-busy")).toBe("true");
  expect(decline.querySelector('[data-slot="spinner"]')).not.toBeNull();
  const approve = screen.getByRole("button", { name: "Approve" });
  expect(approve.getAttribute("aria-busy")).toBeNull();

  finish();
  await screen.findByRole("button", { name: "Decline", busy: false });
  expect(decline.querySelector('[data-slot="spinner"]')).toBeNull();
});

it("shows a spinner and blocks clicks for the loading prop", async () => {
  let clicks = 0;
  render(
    <Button loading onClick={() => clicks++}>
      Save
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Save" });
  expect(button.getAttribute("aria-busy")).toBe("true");
  await userEvent.click(button);
  expect(clicks).toBe(0);
});
