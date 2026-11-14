import { describe, expect, it } from "vitest";
import { checkTestCard, luhnValid } from "./pricing";

const NOW = new Date("2026-11-14T12:00:00Z");

describe("test-mode checkout card check", () => {
  it("Luhn", () => {
    expect(luhnValid("4242424242424242")).toBe(true);
    expect(luhnValid("4242424242424241")).toBe(false);
  });

  it("accepts the standard test card with a future expiry", () => {
    expect(checkTestCard("4242 4242 4242 4242", "12 / 30", "123", NOW)).toEqual({ ok: true });
  });

  it("rejects bad numbers, the decline card, expired cards and bad CVCs", () => {
    expect(checkTestCard("1234 5678", "12/30", "123", NOW)).toMatchObject({ ok: false, field: "number" });
    expect(checkTestCard("4000 0000 0000 0002", "12/30", "123", NOW)).toMatchObject({ ok: false, message: expect.stringContaining("declined") });
    expect(checkTestCard("4242424242424242", "10/26", "123", NOW)).toMatchObject({ ok: false, field: "expiry" });
    expect(checkTestCard("4242424242424242", "11/26", "123", NOW)).toEqual({ ok: true });
    expect(checkTestCard("4242424242424242", "13/30", "123", NOW)).toMatchObject({ ok: false, field: "expiry" });
    expect(checkTestCard("4242424242424242", "12/30", "1", NOW)).toMatchObject({ ok: false, field: "cvc" });
  });
});
