import { describe, it, expect } from "vitest";
import { VERSION } from "@ai-interview-prep/shared";

describe("Smoke Test", () => {
  it("should have shared package version defined", () => {
    expect(VERSION).toBe("1.0.0");
  });
});
