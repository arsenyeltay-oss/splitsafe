import { describe, expect, it } from "vitest";
import { checkAffordability } from "@/lib/engine";
import type { CashProfile } from "@/lib/engine";
import { verdictCopy } from "./verdict-copy";

const TODAY = "2026-11-14";
const base: CashProfile = { balance: 500, paycheckAmount: 1000, frequency: "biweekly", nextPayday: "2026-11-20", bills: [], buffer: 100 };

describe("verdictCopy", () => {
  it("SAFE on a healthy calendar promises the buffer holds", () => {
    const input = { amount: 40, provider: "klarna" as const, term: { kind: "payin4" as const } };
    const c = verdictCopy(input, checkAffordability(base, [], input, TODAY), TODAY, 100);
    expect(c.tone).toBe("safe");
    expect(c.detail).toContain("keeps every day above");
  });

  it("SAFE on a calendar that is already short never claims every day is fine", () => {
    const shaky = { ...base, balance: -50 };
    const input = { amount: 40, provider: "klarna" as const, term: { kind: "monthly" as const, months: 6, apr: 0 } };
    const report = checkAffordability(shaky, [], input, TODAY);
    expect(report.verdict).toBe("SAFE");
    const c = verdictCopy(input, report, TODAY, 100);
    expect(c.detail).not.toContain("keeps every day above");
    expect(c.detail).toContain("short day");
  });

  it("NO names the amount and the date", () => {
    const input = { amount: 1000, provider: "afterpay" as const, term: { kind: "payin4" as const } };
    const c = verdictCopy(input, checkAffordability({ ...base, balance: 100 }, [], input, TODAY), TODAY, 100);
    expect(c.tone).toBe("no");
    expect(c.detail).toMatch(/\$150\.00 short on Nov 14/);
  });
});
