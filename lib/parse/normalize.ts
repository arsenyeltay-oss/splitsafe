import { z } from "zod";
import { expandScheduleRule, isValidISODate, normalizeProvider, roundMoney } from "@/lib/engine";
import type { PlanDraft } from "@/lib/plan-draft";

/**
 * Exactly what the LLM must return. Every field is required and nullable: the model says
 * "null" when the email doesn't state something, and we flag it for the user instead of guessing.
 */
export const llmOutputSchema = z.object({
  plans: z.array(
    z.object({
      provider: z.string().nullable(),
      merchant: z.string().nullable(),
      totalAmount: z.number().nullable(),
      apr: z.number().nullable(),
      installments: z.array(
        z.object({
          dueDate: z.string().nullable(),
          amount: z.number().nullable(),
          status: z.enum(["upcoming", "paid"]),
        }),
      ),
      scheduleRule: z
        .object({
          count: z.number().int().nullable(),
          amount: z.number().nullable(),
          intervalDays: z.number().int().nullable(),
          intervalMonths: z.number().int().nullable(),
          firstDueDate: z.string().nullable(),
        })
        .nullable(),
      confidence: z.enum(["high", "medium", "low"]),
      missingFields: z.array(z.string()),
    }),
  ),
});

export type LlmOutput = z.infer<typeof llmOutputSchema>;
type LlmPlan = LlmOutput["plans"][number];

const positive = (n: number | null): number | null => (n != null && Number.isFinite(n) && n > 0 ? roundMoney(n) : null);

/**
 * Turns one LLM-extracted plan into an editable draft. Deterministic: when the email states a rule
 * ("4 payments of $25 every 2 weeks starting Nov 20") instead of listing dates, the schedule is
 * expanded here in code. Anything missing or malformed is left empty and listed in `missingFields`.
 */
export function llmPlanToDraft(p: LlmPlan, id: string): PlanDraft {
  const missing = new Set(p.missingFields);
  const provider = p.provider ? normalizeProvider(p.provider) : "";
  if (!provider) missing.add("provider");
  const totalAmount = positive(p.totalAmount);
  if (totalAmount == null) missing.add("totalAmount");

  let installments = p.installments.map((i) => ({
    dueDate: i.dueDate && isValidISODate(i.dueDate) ? i.dueDate : "",
    amount: positive(i.amount),
    status: i.status,
  }));

  // A rule describes the payments not listed explicitly (e.g. "first $40 charged today, then
  // 3 payments every 2 weeks"). Without a per-payment amount, the remainder is split evenly.
  const rule = p.scheduleRule;
  if (rule && rule.count && rule.firstDueDate && isValidISODate(rule.firstDueDate)) {
    const explicitKnown = installments.every((i) => i.amount != null);
    const remainder =
      totalAmount != null && explicitKnown ? roundMoney(totalAmount - installments.reduce((s, i) => s + (i.amount ?? 0), 0)) : null;
    const expanded = expandScheduleRule({
      count: rule.count,
      firstDueDate: rule.firstDueDate,
      amount: positive(rule.amount),
      total: positive(remainder),
      intervalDays: rule.intervalDays,
      intervalMonths: rule.intervalMonths,
    });
    if (expanded) {
      const listed = new Set(installments.map((i) => i.dueDate));
      installments = [...installments, ...expanded.filter((i) => !listed.has(i.dueDate))].sort((a, b) =>
        a.dueDate.localeCompare(b.dueDate),
      );
    } else if (installments.length > 0) {
      missing.add("remaining payments");
    }
  }

  if (installments.length === 0) {
    missing.add("installments");
    installments = [{ dueDate: "", amount: null, status: "upcoming" }];
  }
  if (installments.some((i) => !i.dueDate)) missing.add("installment dates");
  if (installments.some((i) => i.amount == null)) missing.add("installment amounts");

  return {
    id,
    provider,
    merchant: (p.merchant ?? "").trim(),
    totalAmount,
    apr: p.apr != null && p.apr >= 0 && p.apr <= 100 ? p.apr : null,
    installments,
    source: "parsed",
    confidence: p.confidence,
    missingFields: [...missing],
  };
}
