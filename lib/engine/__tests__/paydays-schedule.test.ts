import { describe, expect, it } from "vitest";
import { addMonths, isValidISODate } from "../dates";
import { generatePaydays, semimonthlyDays } from "../paydays";
import { expandScheduleRule, monthlySchedule, payIn4Schedule, splitEvenly } from "../schedule";
import { sumMoney } from "../money";

describe("dates", () => {
  it("validates ISO dates including leap years", () => {
    expect(isValidISODate("2028-02-29")).toBe(true);
    expect(isValidISODate("2027-02-29")).toBe(false);
    expect(isValidISODate("2026-13-01")).toBe(false);
    expect(isValidISODate("Nov 20")).toBe(false);
  });

  it("adds months with month-end clamping and keeps the anchor day", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 2)).toBe("2026-03-31");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
  });
});

describe("generatePaydays", () => {
  it("weekly", () => {
    expect(generatePaydays("weekly", "2026-11-20", "2026-11-14", "2026-12-12")).toEqual([
      "2026-11-20",
      "2026-11-27",
      "2026-12-04",
      "2026-12-11",
    ]);
  });

  it("biweekly", () => {
    expect(generatePaydays("biweekly", "2026-11-20", "2026-11-14", "2026-12-31")).toEqual([
      "2026-11-20",
      "2026-12-04",
      "2026-12-18",
    ]);
  });

  it("never generates paydays before the stated next payday or outside the window", () => {
    expect(generatePaydays("biweekly", "2026-11-20", "2026-11-25", "2026-12-10")).toEqual(["2026-12-04"]);
    expect(generatePaydays("weekly", "2027-01-01", "2026-11-14", "2026-12-31")).toEqual([]);
  });

  it("monthly on the 31st clamps to month end without drifting", () => {
    expect(generatePaydays("monthly", "2027-01-31", "2027-01-01", "2027-04-30")).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
    ]);
  });

  it("semi-monthly 15th and last day of month", () => {
    expect(semimonthlyDays("2026-11-30")).toEqual([15, 31]);
    expect(generatePaydays("semimonthly", "2026-11-30", "2026-11-14", "2027-02-28")).toEqual([
      "2026-11-30",
      "2026-12-15",
      "2026-12-31",
      "2027-01-15",
      "2027-01-31",
      "2027-02-15",
      "2027-02-28",
    ]);
  });

  it("semi-monthly 1st and 16th, starting from the 16th", () => {
    expect(semimonthlyDays("2026-11-16")).toEqual([1, 16]);
    expect(generatePaydays("semimonthly", "2026-11-16", "2026-11-14", "2026-12-31")).toEqual([
      "2026-11-16",
      "2026-12-01",
      "2026-12-16",
    ]);
  });
});

describe("installment scheduling", () => {
  it("splits evenly and puts leftover cents on the first payment", () => {
    expect(splitEvenly(100, 3)).toEqual([33.34, 33.33, 33.33]);
    expect(sumMoney(splitEvenly(99.99, 4))).toBe(99.99);
  });

  it("pay in 4: today, then every two weeks", () => {
    expect(payIn4Schedule(160, "2026-11-14").map((i) => [i.dueDate, i.amount])).toEqual([
      ["2026-11-14", 40],
      ["2026-11-28", 40],
      ["2026-12-12", 40],
      ["2026-12-26", 40],
    ]);
  });

  it("expands '4 payments of $25 every 2 weeks starting Nov 20' deterministically", () => {
    const out = expandScheduleRule({ count: 4, amount: 25, intervalDays: 14, firstDueDate: "2026-11-20" });
    expect(out?.map((i) => i.dueDate)).toEqual(["2026-11-20", "2026-12-04", "2026-12-18", "2027-01-01"]);
    expect(out?.every((i) => i.amount === 25 && i.status === "upcoming")).toBe(true);
  });

  it("refuses to guess when the rule is incomplete", () => {
    expect(expandScheduleRule({ count: 4, firstDueDate: "2026-11-20", intervalDays: 14 })).toBeNull();
    expect(expandScheduleRule({ count: 4, amount: 25, firstDueDate: "2026-11-20" })).toBeNull();
    expect(expandScheduleRule({ count: 0, amount: 25, intervalDays: 14, firstDueDate: "2026-11-20" })).toBeNull();
  });

  it("monthly with APR amortizes to the cent", () => {
    const sched = monthlySchedule(900, 6, 15, "2026-10-18");
    expect(sched).toHaveLength(6);
    expect(sched[0]).toMatchObject({ dueDate: "2026-11-18", amount: 156.63 });
    const total = sumMoney(sched.map((i) => i.amount));
    expect(total).toBeGreaterThan(900);
    expect(total).toBeLessThan(940);
  });

  it("monthly at 0% APR pays back exactly the principal", () => {
    const sched = monthlySchedule(100, 3, 0, "2026-01-31");
    expect(sumMoney(sched.map((i) => i.amount))).toBe(100);
    expect(sched.map((i) => i.dueDate)).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
  });
});
