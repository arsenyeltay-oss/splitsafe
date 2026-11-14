import { describe, expect, it } from "vitest";
import { samplePlans, sampleProfile } from "@/lib/sample-data";
import { payoffAmount, payoffOptions } from "../payoff";
import { monthlySchedule } from "../schedule";
import { simulate } from "../simulate";
import { safeToSpend } from "../spend";
import type { CashProfile, Plan } from "../types";

const TODAY = "2026-11-14";
const profile = (over: Partial<CashProfile> = {}): CashProfile => ({
  balance: 600,
  paycheckAmount: 1000,
  frequency: "biweekly",
  nextPayday: "2026-11-20",
  bills: [],
  buffer: 100,
  ...over,
});

describe("safeToSpend", () => {
  it("is the lowest balance before payday minus the buffer", () => {
    const plans: Plan[] = [
      { id: "k", provider: "klarna", merchant: "x", totalAmount: 200, installments: [{ dueDate: "2026-11-17", amount: 200, status: "upcoming" }], source: "manual" },
    ];
    const s = safeToSpend(simulate(profile(), plans, TODAY), profile())!;
    expect(s).toEqual({ amount: 300, until: "2026-11-20", lowPoint: 400, lowPointDate: "2026-11-17" });
  });

  it("never goes below zero, and ignores days after payday", () => {
    const s = safeToSpend(simulate(profile({ balance: 50 }), [], TODAY), profile({ balance: 50 }))!;
    expect(s.amount).toBe(0);
    expect(s.until).toBe("2026-11-20");
  });

  it("spending exactly that amount keeps every day before payday at the buffer or above", () => {
    const p = sampleProfile(TODAY);
    const plans = samplePlans(TODAY);
    const s = safeToSpend(simulate(p, plans, TODAY), p)!;
    const after = simulate({ ...p, balance: p.balance - s.amount }, plans, TODAY).filter((d) => d.date < s.until);
    expect(s.amount === 0 || after.every((d) => d.endBalance >= p.buffer)).toBe(true);
  });
});

describe("early payoff", () => {
  const loan: Plan = {
    id: "affirm",
    provider: "affirm",
    merchant: "Couch",
    totalAmount: 900,
    apr: 15,
    installments: monthlySchedule(900, 6, 15, "2026-11-01"),
    source: "manual",
  };

  it("payoff on the first due date is the remaining principal: 0% sums, APR discounts", () => {
    expect(payoffAmount({ ...loan, apr: 0 }, "2026-12-01")).toBe(939.77);
    const p = payoffAmount(loan, "2026-12-01");
    expect(p).toBeGreaterThan(900);
    expect(p).toBeLessThan(939.77);
  });

  it("with spare cash, an interest-bearing plan can be paid off today and saves interest", () => {
    const [opt] = payoffOptions(profile({ balance: 3000 }), [loan], TODAY);
    expect(opt.safeDate).toBe(TODAY);
    expect(opt.interestSaved).toBeGreaterThan(20);
    expect(opt.debtFreeAfter).toBe(TODAY);
  });

  it("waits for a date that doesn't create a tight or short day", () => {
    const [opt] = payoffOptions(profile({ balance: 300 }), [loan], TODAY);
    expect(opt.safeDate === null || opt.safeDate > TODAY).toBe(true);
  });

  it("debt-free date after an early payoff is never before the payoff itself", () => {
    const opts = payoffOptions(sampleProfile(TODAY), samplePlans(TODAY), TODAY);
    for (const o of opts) if (o.safeDate && o.debtFreeAfter) expect(o.debtFreeAfter >= o.safeDate).toBe(true);
  });

  it("sorts by interest saved; 0% plans save nothing", () => {
    const zero: Plan = { ...loan, id: "zero", apr: 0, merchant: "TV" };
    const opts = payoffOptions(profile({ balance: 5000 }), [zero, loan], TODAY);
    expect(opts.map((o) => o.planId)).toEqual(["affirm", "zero"]);
    expect(opts[1].interestSaved).toBe(0);
  });
});
