import { describe, expect, it } from "vitest";
import { sampleEmails, samplePlans, sampleProfile } from "@/lib/sample-data";
import { assessPurchase, checkAffordability, findEarliestSafeDate } from "../afford";
import { addDays } from "../dates";
import { nextDangerDay } from "../insights";
import { hardshipMessage, rescuePlan } from "../rescue";
import { simulate } from "../simulate";
import type { CashProfile, Plan } from "../types";

const TODAY = "2026-11-14";

const profile = (over: Partial<CashProfile> = {}): CashProfile => ({
  balance: 300,
  paycheckAmount: 1000,
  frequency: "biweekly",
  nextPayday: "2026-11-20",
  bills: [],
  buffer: 100,
  ...over,
});

describe("affordability verdict", () => {
  it("SAFE when the balance stays above the buffer", () => {
    const r = assessPurchase(profile(), [], { amount: 100, provider: "klarna", term: { kind: "payin4" } }, TODAY);
    expect(r.verdict).toBe("SAFE");
    expect(r.firstProblem).toBeNull();
    expect(r.totalCost).toBe(100);
  });

  it("TIGHT when it dips below the buffer but not below zero", () => {
    const r = assessPurchase(profile(), [], { amount: 900, provider: "klarna", term: { kind: "payin4" } }, TODAY);
    expect(r.verdict).toBe("TIGHT");
    expect(r.firstProblem).toMatchObject({ date: TODAY, endBalance: 75, gap: 25 });
  });

  it("NO with the exact first short date and amount", () => {
    const r = assessPurchase(profile(), [], { amount: 1600, provider: "klarna", term: { kind: "payin4" } }, TODAY);
    expect(r.verdict).toBe("NO");
    expect(r.firstProblem).toMatchObject({ date: TODAY, endBalance: -100, gap: 100 });
  });

  it("does not blame the purchase for problems that exist anyway", () => {
    const already = profile({ balance: -50, nextPayday: "2026-11-20" });
    // First installment lands after payday, so the pre-existing short days are unchanged.
    const r = assessPurchase(already, [], { amount: 100, provider: "klarna", term: { kind: "payin4" } }, TODAY, "2026-11-21");
    expect(r.verdict).toBe("SAFE");
    expect(r.preexistingShortDays).toBeGreaterThan(0);
  });

  it("finds the earliest safe start date (after payday)", () => {
    const date = findEarliestSafeDate(profile({ balance: 140 }), [], { amount: 200, provider: "klarna", term: { kind: "payin4" } }, TODAY);
    expect(date).toBe("2026-11-20");
  });

  it("returns null when no safe date exists in the window", () => {
    const broke = profile({ balance: 0, paycheckAmount: 0 });
    expect(findEarliestSafeDate(broke, [], { amount: 200, provider: "klarna", term: { kind: "payin4" } }, TODAY)).toBeNull();
  });

  it("suggests a safer term when one exists", () => {
    const report = checkAffordability(profile({ balance: 150, paycheckAmount: 0 }), [], {
      amount: 240,
      provider: "affirm",
      term: { kind: "payin4" },
    }, TODAY);
    expect(report.verdict).toBe("NO");
    expect(report.saferTerm).toBeNull(); // no income at all: nothing is safe
    const withIncome = checkAffordability(profile({ balance: 150 }), [], {
      amount: 240,
      provider: "affirm",
      term: { kind: "payin4" },
    }, TODAY);
    expect(withIncome.verdict).not.toBe("SAFE");
    expect(withIncome.saferTerm?.term.kind).toBe("monthly");
    expect(withIncome.saferTerm?.result.verdict).toBe("SAFE");
  });
});

describe("rescue mode", () => {
  const plans: Plan[] = [
    { id: "affirm", provider: "affirm", merchant: "Couch", totalAmount: 300, installments: [{ dueDate: "2026-11-21", amount: 300, status: "upcoming" }], source: "manual" },
    { id: "afterpay", provider: "afterpay", merchant: "Jacket", totalAmount: 30, installments: [{ dueDate: "2026-11-21", amount: 30, status: "upcoming" }], source: "manual" },
  ];
  const p = profile({ balance: 0, bills: [{ id: "rent", name: "Rent", amount: 500, dayOfMonth: 21, essential: true }] });

  it("lists failing payments and ranks essentials, then credit-reporting, then late-fee", () => {
    const report = rescuePlan(p, plans, TODAY, 600, 10);
    // $600 in: rent $500 is reserved first, Affirm $300 no longer fits, Afterpay $30 still does.
    expect(report.atRisk.map((r) => r.event.label)).toEqual(["Affirm · Couch"]);
    expect(report.priorities.map((o) => o.tier)).toEqual([1]);
  });

  it("essentials are protected first but flagged when even they cannot be covered", () => {
    const report = rescuePlan(p, plans, TODAY, 400, 10);
    expect(report.priorities[0]).toMatchObject({ kind: "bill", tier: 0, firstAtRiskDate: "2026-11-21" });
    expect(report.priorities.map((o) => o.tier)).toEqual([0, 1, 2]);
  });

  it("allocates by priority across the pay period, not by autopay order", () => {
    // BNPL autopays on the 16th would drain the account before rent on the 18th; rescue protects rent.
    const early = profile({ balance: 500, paycheckAmount: 0, bills: [{ id: "rent", name: "Rent", amount: 450, dayOfMonth: 18, essential: true }] });
    const bnpl: Plan[] = [
      { id: "k", provider: "klarna", merchant: "Shoes", totalAmount: 100, installments: [{ dueDate: "2026-11-16", amount: 100, status: "upcoming" }], source: "manual" },
    ];
    const report = rescuePlan(early, bnpl, TODAY, 0, 10);
    expect(report.priorities.map((o) => o.label)).toEqual(["Klarna · Shoes"]);
  });

  it("non-essential bills rank lowest", () => {
    const subs = profile({ balance: 0, paycheckAmount: 50, bills: [{ id: "tv", name: "Streaming", amount: 60, dayOfMonth: 21, essential: false }] });
    expect(rescuePlan(subs, [], TODAY, 50, 10).priorities[0]).toMatchObject({ label: "Streaming", tier: 3 });
  });

  it("nothing at risk when income covers everything", () => {
    expect(rescuePlan(p, plans, TODAY, 2000, 10).priorities).toEqual([]);
  });

  it("generates a polite hardship message naming the provider and date", () => {
    const msg = hardshipMessage(plans[1], { firstAtRiskDate: "2026-11-21", amountAtRisk: 30 });
    expect(msg).toContain("Hi Afterpay team");
    expect(msg).toContain("November 21, 2026");
    expect(msg).toContain("hardship program");
    expect(msg).not.toContain("credit reporting");
  });
});

describe("sample data story (any day of the year)", () => {
  const start = "2026-01-01";
  const todays = Array.from({ length: 366 }, (_, i) => addDays(start, i));

  it("always shows a short day within 3 weeks, and the $240 Klarna check says NO with a safe date", () => {
    for (const today of todays) {
      const p = sampleProfile(today);
      const plans = samplePlans(today);
      const danger = nextDangerDay(simulate(p, plans, today), p.buffer);
      expect(danger?.status, today).toBe("short");
      expect(danger!.date <= addDays(today, 21), today).toBe(true);

      const report = checkAffordability(p, plans, { amount: 240, provider: "klarna", term: { kind: "payin4" } }, today);
      expect(report.verdict, today).toBe("NO");
      expect(report.earliestSafeDate, today).not.toBeNull();
    }
  }, 30_000);

  it("emails mention every plan's merchant and amount", () => {
    const text = sampleEmails(TODAY);
    for (const s of ["Nike", "$160.00", "Urban Outfitters", "$120.00", "Wayfair", "15.00%"]) expect(text).toContain(s);
  });
});
