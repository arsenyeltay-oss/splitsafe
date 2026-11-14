import { describe, expect, it } from "vitest";
import { detectOffer } from "./bnpl-detect";

describe("detectOffer", () => {
  it("pay in 4 with the provider named nearby", () => {
    const d = detectOffer("Total $240.00\nPay in 4 interest-free payments of $60.00 with Klarna. Learn more");
    expect(d?.input).toEqual({ amount: 240, provider: "klarna", term: { kind: "payin4" } });
    expect(d?.match).toBe("4 interest-free payments of $60.00");
  });

  it("handles thousands separators and installments wording", () => {
    expect(detectOffer("or 4 installments of $1,012.50 by Afterpay")?.input).toEqual({
      amount: 4050,
      provider: "afterpay",
      term: { kind: "payin4" },
    });
  });

  it("monthly offers", () => {
    expect(detectOffer("As low as 6 monthly payments of $41.67 with Affirm")?.input).toEqual({
      amount: 250.02,
      provider: "affirm",
      term: { kind: "monthly", months: 6, apr: 0 },
    });
    expect(detectOffer("Affirm: $50/mo for 12 months")?.input.term).toEqual({ kind: "monthly", months: 12, apr: 0 });
  });

  it("falls back to 'other' when no provider is named", () => {
    expect(detectOffer("4 payments of $25")?.input.provider).toBe("other");
  });

  it("ignores pages without an explicit offer", () => {
    expect(detectOffer("Free shipping on orders over $50. Pay with Klarna.")).toBeNull();
    expect(detectOffer("3 payments of $20")).toBeNull();
  });
});
