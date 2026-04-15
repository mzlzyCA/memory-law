import { describe, expect, it } from "vitest";

import { getWelcomeMessage } from "./index";

describe("getWelcomeMessage", () => {
  it("returns default ready message", () => {
    expect(getWelcomeMessage()).toBe("memory-law CLI is ready.");
  });
});
