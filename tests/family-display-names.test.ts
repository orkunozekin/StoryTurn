import { describe, expect, it } from "vitest";
import { familyDisplayName, familyDisplayNames } from "@/lib/first-name";

describe("familyDisplayNames", () => {
  it("shows only first names when they are unique in the family", () => {
    expect(
      familyDisplayNames([
        { id: "a", displayName: "Alex Smith" },
        { id: "b", displayName: "Jordan Smith" },
        { id: "c", displayName: "Sam" },
      ]),
    ).toEqual({ a: "Alex", b: "Jordan", c: "Sam" });
  });

  it("keeps full names for members who share a first name", () => {
    expect(
      familyDisplayNames([
        { id: "a", displayName: "Alex Smith" },
        { id: "b", displayName: "  alex   Jones " },
        { id: "c", displayName: "Jordan Smith" },
      ]),
    ).toEqual({ a: "Alex Smith", b: "alex   Jones", c: "Jordan" });
  });

  it("works out one member's name against the rest of the family", () => {
    const family = [
      { id: "a", displayName: "Alex Smith" },
      { id: "b", displayName: "Alex Jones" },
    ];
    expect(familyDisplayName(family[0]!, family)).toBe("Alex Smith");
    expect(familyDisplayName({ id: "c", displayName: "Jordan Lee" }, family)).toBe(
      "Jordan",
    );
  });
});
