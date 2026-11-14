import { describe, expect, it } from "vitest";
import { llmOutputSchema, llmPlanToDraft, type LlmOutput } from "./normalize";

type LlmPlan = LlmOutput["plans"][number];

const base: LlmPlan = {
  provider: "Klarna",
  merchant: "Nike",
  totalAmount: 100,
  apr: null,
  installments: [],
  scheduleRule: null,
  confidence: "high",
  missingFields: [],
};

describe("llmPlanToDraft", () => {
  it("expands a stated rule in code: 4 payments of $25 every 2 weeks starting Nov 20", () => {
    const d = llmPlanToDraft(
      { ...base, scheduleRule: { count: 4, amount: 25, intervalDays: 14, intervalMonths: null, firstDueDate: "2026-11-20" } },
      "x",
    );
    expect(d.installments.map((i) => [i.dueDate, i.amount])).toEqual([
      ["2026-11-20", 25],
      ["2026-12-04", 25],
      ["2026-12-18", 25],
      ["2027-01-01", 25],
    ]);
    expect(d.missingFields).toEqual([]);
    expect(d.provider).toBe("klarna");
  });

  it("combines a paid first payment with a rule for the rest, splitting the remainder", () => {
    const d = llmPlanToDraft(
      {
        ...base,
        totalAmount: 160,
        installments: [{ dueDate: "2026-11-02", amount: 40, status: "paid" }],
        scheduleRule: { count: 3, amount: null, intervalDays: 14, intervalMonths: null, firstDueDate: "2026-11-16" },
      },
      "x",
    );
    expect(d.installments.map((i) => [i.dueDate, i.amount, i.status])).toEqual([
      ["2026-11-02", 40, "paid"],
      ["2026-11-16", 40, "upcoming"],
      ["2026-11-30", 40, "upcoming"],
      ["2026-12-14", 40, "upcoming"],
    ]);
  });

  it('"$40 charged today, then every 2 weeks": the next date follows from the paid payment', () => {
    const d = llmPlanToDraft(
      {
        ...base,
        totalAmount: 160,
        installments: [{ dueDate: "2026-11-14", amount: 40, status: "paid" }],
        scheduleRule: { count: 3, amount: 40, intervalDays: 14, intervalMonths: null, firstDueDate: null },
        missingFields: ["scheduleRule.firstDueDate"],
      },
      "x",
    );
    expect(d.installments.map((i) => [i.dueDate, i.amount, i.status])).toEqual([
      ["2026-11-14", 40, "paid"],
      ["2026-11-28", 40, "upcoming"],
      ["2026-12-12", 40, "upcoming"],
      ["2026-12-26", 40, "upcoming"],
    ]);
    expect(d.missingFields).toEqual([]);
  });

  it("does not double-count when the rule's count includes the payment already listed", () => {
    const d = llmPlanToDraft(
      {
        ...base,
        totalAmount: 160,
        installments: [{ dueDate: "2026-11-14", amount: 40, status: "paid" }],
        scheduleRule: { count: 4, amount: 40, intervalDays: 14, intervalMonths: null, firstDueDate: null },
      },
      "x",
    );
    expect(d.installments).toHaveLength(4);
    expect(d.installments.reduce((s, i) => s + (i.amount ?? 0), 0)).toBe(160);
  });

  it("a rule with a stated start that includes the listed first payment keeps every payment", () => {
    const d = llmPlanToDraft(
      {
        ...base,
        totalAmount: 240,
        installments: [{ dueDate: "2026-11-20", amount: 60, status: "upcoming" }],
        scheduleRule: { count: 4, amount: 60, intervalDays: 14, intervalMonths: null, firstDueDate: "2026-11-20" },
      },
      "x",
    );
    expect(d.installments.map((i) => i.dueDate)).toEqual(["2026-11-20", "2026-12-04", "2026-12-18", "2027-01-01"]);
  });

  it("a monthly rule continues one month after the down payment", () => {
    const d = llmPlanToDraft(
      {
        ...base,
        totalAmount: 300,
        installments: [{ dueDate: "2026-11-14", amount: 100, status: "paid" }],
        scheduleRule: { count: 2, amount: 100, intervalDays: null, intervalMonths: 1, firstDueDate: null },
      },
      "x",
    );
    expect(d.installments.map((i) => i.dueDate)).toEqual(["2026-11-14", "2026-12-14", "2027-01-14"]);
  });

  it("a rule with no date to start from is not guessed: the remaining payments are flagged", () => {
    const d = llmPlanToDraft(
      {
        ...base,
        totalAmount: 160,
        installments: [{ dueDate: null, amount: 40, status: "upcoming" }],
        scheduleRule: { count: 3, amount: 40, intervalDays: 14, intervalMonths: null, firstDueDate: null },
      },
      "x",
    );
    expect(d.installments).toHaveLength(1);
    expect(d.missingFields).toEqual(expect.arrayContaining(["remaining payments", "installment dates"]));
  });

  it("keeps explicitly listed payments and normalizes the provider name", () => {
    const d = llmPlanToDraft(
      {
        ...base,
        provider: "PayPal Pay in 4",
        installments: [
          { dueDate: "2026-11-01", amount: 25, status: "paid" },
          { dueDate: "2026-11-15", amount: 25, status: "upcoming" },
        ],
      },
      "x",
    );
    expect(d.provider).toBe("paypal");
    expect(d.installments).toHaveLength(2);
    expect(d.installments[0].status).toBe("paid");
  });

  it("never invents missing values — they stay empty and are flagged", () => {
    const d = llmPlanToDraft(
      {
        ...base,
        provider: null,
        totalAmount: null,
        installments: [{ dueDate: "Nov 20", amount: null, status: "upcoming" }],
        missingFields: ["merchant"],
      },
      "x",
    );
    expect(d.provider).toBe("");
    expect(d.totalAmount).toBeNull();
    expect(d.installments[0]).toEqual({ dueDate: "", amount: null, status: "upcoming" });
    expect(d.missingFields).toEqual(expect.arrayContaining(["merchant", "provider", "totalAmount", "installment dates", "installment amounts"]));
  });

  it("an incomplete rule is not expanded", () => {
    const d = llmPlanToDraft(
      { ...base, totalAmount: null, scheduleRule: { count: 4, amount: null, intervalDays: 14, intervalMonths: null, firstDueDate: "2026-11-20" } },
      "x",
    );
    expect(d.missingFields).toContain("installments");
    expect(d.installments).toEqual([{ dueDate: "", amount: null, status: "upcoming" }]);
  });

  it("schema rejects malformed model output", () => {
    expect(llmOutputSchema.safeParse({ plans: [{ provider: "Klarna" }] }).success).toBe(false);
    expect(llmOutputSchema.safeParse({ plans: [] }).success).toBe(true);
  });
});
