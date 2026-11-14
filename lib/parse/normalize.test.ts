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
