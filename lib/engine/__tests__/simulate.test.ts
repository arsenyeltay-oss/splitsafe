import { describe, expect, it } from "vitest";
import { addDays } from "../dates";
import { debtSummary, nextDangerDay, nextPaycheckInsight } from "../insights";
import { simulate } from "../simulate";
import type { CashProfile, Plan } from "../types";

const TODAY = "2026-11-14";

const profile = (over: Partial<CashProfile> = {}): CashProfile => ({
  balance: 500,
  paycheckAmount: 1000,
  frequency: "biweekly",
  nextPayday: "2026-11-20",
  bills: [],
  buffer: 100,
  ...over,
});

const plan = (id: string, installments: Plan["installments"], over: Partial<Plan> = {}): Plan => ({
  id,
  provider: "klarna",
  merchant: "Shop",
  totalAmount: installments.reduce((s, i) => s + i.amount, 0),
  installments,
  source: "manual",
  ...over,
});

describe("simulate", () => {
  it("empty state: flat balance, every day ok", () => {
    const days = simulate(profile({ paycheckAmount: 0 }), [], TODAY);
    expect(days).toHaveLength(90);
    expect(days[0].date).toBe(TODAY);
    expect(days[89].date).toBe(addDays(TODAY, 89));
    expect(days.every((d) => d.endBalance === 500 && d.status === "ok")).toBe(true);
  });

  it("applies paychecks, bills and installments on the right days", () => {
    const days = simulate(
      profile({ bills: [{ id: "rent", name: "Rent", amount: 1200, dayOfMonth: 1 }] }),
      [plan("p", [{ dueDate: "2026-11-16", amount: 50, status: "upcoming" }])],
      TODAY,
    );
    const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
    expect(byDate["2026-11-16"].endBalance).toBe(450);
    expect(byDate["2026-11-20"].endBalance).toBe(1450);
    expect(byDate["2026-12-01"].endBalance).toBe(250);
    expect(byDate["2026-12-01"].status).toBe("ok");
    expect(byDate["2026-12-04"].endBalance).toBe(1250);
  });

  it("same-day events: income posts before outflows, all events listed", () => {
    const days = simulate(
      profile({ balance: 0, bills: [{ id: "b", name: "Gym", amount: 30, dayOfMonth: 20 }] }),
      [plan("p", [{ dueDate: "2026-11-20", amount: 40, status: "upcoming" }])],
      TODAY,
    );
    const day = days.find((d) => d.date === "2026-11-20")!;
    expect(day.events.map((e) => e.kind)).toEqual(["income", "bill", "installment"]);
    expect(day.endBalance).toBe(930);
    expect(day.status).toBe("ok");
  });

  it("flags short (< $0) and tight (< buffer) days", () => {
    const days = simulate(profile({ balance: 120 }), [
      plan("p", [
        { dueDate: "2026-11-15", amount: 40, status: "upcoming" },
        { dueDate: "2026-11-17", amount: 100, status: "upcoming" },
      ]),
    ], TODAY);
    expect(days[0].status).toBe("ok");
    expect(days[1]).toMatchObject({ date: "2026-11-15", endBalance: 80, status: "tight" });
    expect(days[3]).toMatchObject({ date: "2026-11-17", endBalance: -20, status: "short" });
  });

  it("partially paid plans: paid installments are ignored, overdue unpaid ones count today", () => {
    const days = simulate(profile({ paycheckAmount: 0 }), [
      plan("p", [
        { dueDate: "2026-10-31", amount: 40, status: "paid" },
        { dueDate: "2026-11-10", amount: 40, status: "upcoming" },
        { dueDate: "2026-11-24", amount: 40, status: "upcoming" },
      ]),
    ], TODAY);
    expect(days[0].endBalance).toBe(460);
    const overdue = days[0].events[0];
    expect(overdue.kind === "installment" && overdue.overdue).toBe(true);
    expect(days[10].endBalance).toBe(420);
  });

  it("bills on the 31st land on the last day of shorter months", () => {
    const days = simulate(
      profile({ paycheckAmount: 0, bills: [{ id: "b", name: "Loan", amount: 10, dayOfMonth: 31 }] }),
      [],
      TODAY,
    );
    const billDays = days.filter((d) => d.events.length > 0).map((d) => d.date);
    expect(billDays).toEqual(["2026-11-30", "2026-12-31", "2027-01-31"]);
  });
});

describe("insights", () => {
  it("next danger day explains which payments caused it before payday", () => {
    const p = profile({ balance: 100, bills: [{ id: "phone", name: "Phone", amount: 30, dayOfMonth: 15 }] });
    const plans = [
      plan("a", [{ dueDate: "2026-11-16", amount: 40, status: "upcoming" }], { provider: "afterpay" }),
      plan("b", [{ dueDate: "2026-11-18", amount: 73, status: "upcoming" }], { provider: "affirm" }),
    ];
    const danger = nextDangerDay(simulate(p, plans, TODAY), p.buffer)!;
    expect(danger).toMatchObject({ date: "2026-11-18", status: "short", gap: 43, beforePayday: true });
    expect(danger.contributors.map((c) => c.amount)).toEqual([30, 40, 73]);
  });

  it("danger day falls back to the first tight day, and is null when all is well", () => {
    const tight = nextDangerDay(simulate(profile({ balance: 50 }), [], TODAY), 100);
    expect(tight).toMatchObject({ date: TODAY, status: "tight", gap: 50 });
    expect(nextDangerDay(simulate(profile(), [], TODAY), 100)).toBeNull();
  });

  it("already promised from next paycheck: outflows from payday until the following one", () => {
    const p = profile({ bills: [{ id: "rent", name: "Rent", amount: 1200, dayOfMonth: 1 }] });
    const plans = [
      plan("p", [
        { dueDate: "2026-11-18", amount: 40, status: "upcoming" },
        { dueDate: "2026-11-25", amount: 40, status: "upcoming" },
        { dueDate: "2026-12-04", amount: 40, status: "upcoming" },
      ]),
    ];
    const insight = nextPaycheckInsight(simulate(p, plans, TODAY), p)!;
    expect(insight).toMatchObject({ date: "2026-11-20", promised: 1240, promisedBnpl: 40, promisedBills: 1200 });
  });

  it("debt-free date and outstanding total ignore paid installments", () => {
    const plans = [
      plan("a", [
        { dueDate: "2026-11-01", amount: 40, status: "paid" },
        { dueDate: "2026-12-01", amount: 40, status: "upcoming" },
      ]),
      plan("b", [{ dueDate: "2027-03-14", amount: 156.62, status: "upcoming" }]),
      plan("c", [{ dueDate: "2026-10-01", amount: 30, status: "paid" }]),
    ];
    expect(debtSummary(plans)).toEqual({ debtFreeDate: "2027-03-14", totalOutstanding: 196.62, activePlans: 2 });
    expect(debtSummary([])).toEqual({ debtFreeDate: null, totalOutstanding: 0, activePlans: 0 });
  });
});
