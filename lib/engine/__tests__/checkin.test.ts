import { describe, expect, it } from "vitest";
import { applyCheckIn, checkInSummary, payoffProgress } from "../checkin";
import type { CashProfile, Plan } from "../types";

const profile: CashProfile = {
  balance: 500,
  paycheckAmount: 1000,
  frequency: "biweekly",
  nextPayday: "2026-11-10",
  bills: [{ id: "phone", name: "Phone", amount: 60, dayOfMonth: 8, essential: true }],
  buffer: 100,
};
const plans: Plan[] = [
  {
    id: "k",
    provider: "klarna",
    merchant: "Nike",
    totalAmount: 160,
    installments: [
      { dueDate: "2026-10-27", amount: 40, status: "paid" },
      { dueDate: "2026-11-09", amount: 40, status: "upcoming" },
      { dueDate: "2026-11-23", amount: 40, status: "upcoming" },
      { dueDate: "2026-12-07", amount: 40, status: "upcoming" },
    ],
    source: "manual",
  },
  {
    id: "a",
    provider: "afterpay",
    merchant: "Jacket",
    totalAmount: 60,
    installments: [{ dueDate: "2026-11-12", amount: 60, status: "upcoming" }],
    source: "manual",
  },
];

describe("weekly check-in", () => {
  it("nothing to do on the same day", () => {
    expect(checkInSummary(profile, plans, "2026-11-14", "2026-11-14")).toBeNull();
  });

  it("replays the week: paycheck, bills, BNPL payments, projected balance and next payday", () => {
    const s = checkInSummary(profile, plans, "2026-11-07", "2026-11-14")!;
    expect(s.income).toBe(1000);
    expect(s.bills).toBe(60);
    expect(s.payments.map((p) => [p.date, p.amount])).toEqual([
      ["2026-11-09", 40],
      ["2026-11-12", 60],
    ]);
    expect(s.estimatedBalance).toBe(500 + 1000 - 60 - 40 - 60);
    expect(s.nextPayday).toBe("2026-11-24");
  });

  it("marks confirmed payments paid and leaves missed ones unpaid", () => {
    const s = checkInSummary(profile, plans, "2026-11-07", "2026-11-14")!;
    const r = applyCheckIn(profile, plans, s, new Set([1]), 1400);
    expect(r.paidCount).toBe(1);
    expect(r.missedCount).toBe(1);
    expect(r.profile).toMatchObject({ balance: 1400, nextPayday: "2026-11-24" });
    expect(r.plans[0].installments.map((i) => i.status)).toEqual(["paid", "paid", "upcoming", "upcoming"]);
    expect(r.plans[1].installments[0].status).toBe("upcoming");
  });

  it("payoff progress across all plans", () => {
    expect(payoffProgress(plans)).toEqual({ paid: 40, total: 220, ratio: 40 / 220 });
    expect(payoffProgress([]).ratio).toBe(0);
  });
});
