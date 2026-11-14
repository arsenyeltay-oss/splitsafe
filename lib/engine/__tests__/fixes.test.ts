import { describe, expect, it } from "vitest";
import { samplePlans, sampleProfile } from "@/lib/sample-data";
import { addDays } from "../dates";
import { moveRequestMessage, suggestFixes, type FixAction } from "../fixes";
import { simulate } from "../simulate";
import type { CashProfile, Plan } from "../types";

const TODAY = "2026-11-14";
const profile = (over: Partial<CashProfile> = {}): CashProfile => ({
  balance: 100,
  paycheckAmount: 1000,
  frequency: "biweekly",
  nextPayday: "2026-11-20",
  bills: [],
  buffer: 0,
  ...over,
});
const plan = (id: string, provider: Plan["provider"], dueDate: string, amount: number): Plan => ({
  id,
  provider,
  merchant: id,
  totalAmount: amount,
  installments: [{ dueDate, amount, status: "upcoming" }],
  source: "manual",
});

/** Re-applies a fix by hand and returns the simulation, to check suggestions really work. */
function apply(p: CashProfile, plans: Plan[], actions: FixAction[]) {
  const paused = new Set(actions.flatMap((a) => (a.kind === "pause" ? [a.billId] : [])));
  const moved = plans.map((pl) => ({
    ...pl,
    installments: pl.installments.map((i) => {
      const m = actions.find((a) => a.kind === "move" && a.planId === pl.id && a.from === i.dueDate);
      return m && m.kind === "move" ? { ...i, dueDate: m.to } : i;
    }),
  }));
  return simulate({ ...p, bills: p.bills.filter((b) => !paused.has(b.id)) }, moved, TODAY);
}

describe("suggestFixes", () => {
  it("returns null when there is no danger day", () => {
    expect(suggestFixes(profile({ balance: 1000 }), [], TODAY)).toBeNull();
  });

  it("moving one payment to payday clears the window", () => {
    const plans = [plan("a", "klarna", "2026-11-16", 40), plan("b", "affirm", "2026-11-18", 90)];
    const r = suggestFixes(profile(), plans, TODAY)!;
    expect(r.danger.date).toBe("2026-11-18");
    expect(r.moveTo).toBe("2026-11-20");
    expect(r.cashNeeded).toBe(30);
    // Either single move covers the $30 gap; the smaller amount is suggested first.
    expect(r.fixes.map((f) => f.actions.map((a) => a.label))).toEqual([["Klarna · a"], ["Affirm · b"]]);
    expect(r.fixes[0].actions[0]).toMatchObject({ kind: "move", from: "2026-11-16", to: "2026-11-20" });
    for (const f of r.fixes) expect(apply(profile(), plans, f.actions).some((d) => d.date < r.moveTo && d.status === "short")).toBe(false);
  });

  it("prefers pausing a non-essential bill over asking a provider", () => {
    const p = profile({ bills: [{ id: "tv", name: "Streaming", amount: 50, dayOfMonth: 17, essential: false }] });
    const r = suggestFixes(p, [plan("a", "klarna", "2026-11-16", 80)], TODAY)!;
    expect(r.fixes[0].actions).toEqual([{ kind: "pause", billId: "tv", label: "Streaming", amount: 50, date: "2026-11-17" }]);
  });

  it("never touches essential bills, and offers no fix when BNPL isn't the cause", () => {
    const p = profile({ balance: 0, bills: [{ id: "rent", name: "Rent", amount: 500, dayOfMonth: 15, essential: true }] });
    const r = suggestFixes(p, [plan("a", "klarna", "2026-11-16", 40)], TODAY)!;
    expect(r.fixes).toEqual([]);
    expect(r.cashNeeded).toBe(540);
  });

  it("sample persona always gets a working fix", () => {
    for (let i = 0; i < 366; i += 7) {
      const today = addDays("2026-01-01", i);
      const p = sampleProfile(today);
      const plans = samplePlans(today);
      const r = suggestFixes(p, plans, today)!;
      expect(r.fixes.length, today).toBeGreaterThan(0);
    }
  }, 30_000);

  it("writes a polite date-change request", () => {
    const pl = plan("Nike", "klarna", "2026-11-16", 40);
    const msg = moveRequestMessage(pl, { kind: "move", planId: "Nike", provider: "klarna", label: "Klarna · Nike", amount: 40, from: "2026-11-16", to: "2026-11-20" });
    expect(msg).toContain("Hi Klarna team");
    expect(msg).toContain("November 20, 2026");
  });
});
