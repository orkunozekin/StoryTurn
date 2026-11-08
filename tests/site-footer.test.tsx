import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteFooter } from "@/components/site-footer";

describe("SiteFooter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the Studio Artemis LLC copyright for the current year", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-03-01T12:00:00Z"));
    render(<SiteFooter />);
    expect(screen.getByRole("contentinfo")).toHaveTextContent(
      "© 2027 Studio Artemis LLC. All rights reserved.",
    );
  });

  it("links the company name to the Studio Artemis site in a new tab", () => {
    render(<SiteFooter />);
    const link = screen.getByRole("link", { name: "Studio Artemis LLC" });
    expect(link).toHaveAttribute("href", "https://studioartemis.io");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
