import { addDays, daysBetween, maxDate } from "./dates";
import { debtSummary } from "./insights";
import { roundMoney, sumMoney } from "./money";
import { DEFAULT_HORIZON_DAYS, simulate } from "./simulate";
import { providerName } from "./providers";
import type { CashProfile, ISODate, Plan } from "./types";

export const PAYOFF_SEARCH_DAYS = 60;
const DAYS_PER_MONTH = 365.25 / 12;

/**
 * Estimated amount to clear a plan on `date`: every unpaid installment due on or after that date,
 * discounted at the plan's APR (an amortized loan's remaining principal). 0% plans just sum up.
 * Providers compute exact payoff quotes differently, so the UI labels this an estimate.
 */
export function payoffAmount(plan: Plan, date: ISODate): number {
  const r = (plan.apr ?? 0) / 100 / 12;
  const due = plan.installments.filter((i) => i.status === "upcoming" && i.dueDate >= date);
  return roundMoney(due.reduce((s, i) => s + i.amount / Math.pow(1 + r, Math.max(0, daysBetween(date, i.dueDate)) / DAYS_PER_MONTH), 0));
}

/** The plans after paying `planId` off on `date`: its remaining installments become one payment that day. */
function withPayoff(plans: Plan[], planId: string, date: ISODate, amount: number): Plan[] {
  return plans.map((p) =>
    p.id !== planId
      ? p
      : {
          ...p,
          installments: [
            ...p.installments.filter((i) => i.status === "paid" || i.dueDate < date),
            { dueDate: date, amount, status: "upcoming" as const },
          ],
        },
  );
}

/** Safe = no day ends below the buffer *and* lower than it would without the early payoff. */
function isSafe(profile: CashProfile, plans: Plan[], next: Plan[], today: ISODate): boolean {
  const base = simulate(profile, plans, today, { horizonDays: DEFAULT_HORIZON_DAYS });
  const after = simulate(profile, next, today, { horizonDays: DEFAULT_HORIZON_DAYS });
  return after.every((d, i) => !(d.endBalance < profile.buffer && d.endBalance < base[i].endBalance - 0.005));
}

export interface PayoffOption {
  planId: string;
  label: string;
  apr: number;
  /** Sum of the unpaid installments as scheduled. */
  remaining: number;
  /** Earliest date (today or later, within the search window) it can be paid off without new tight or short days. */
  safeDate: ISODate | null;
  payoffAtSafeDate: number | null;
  /** Scheduled payments still due on or after the safe date (what the early payoff replaces). */
  remainingAtSafeDate: number | null;
  interestSaved: number;
  /** Debt-free date across all plans if this one is paid off on the safe date. */
  debtFreeAfter: ISODate | null;
  debtFreeBefore: ISODate | null;
}

/**
 * For each plan with payments left: when could it be paid off early without hurting the calendar,
 * what would it cost then, and how much interest would that save. Best savings first.
 */
export function payoffOptions(profile: CashProfile, plans: Plan[], today: ISODate): PayoffOption[] {
  const before = debtSummary(plans).debtFreeDate;
  const options: PayoffOption[] = [];

  for (const plan of plans) {
    const upcoming = plan.installments.filter((i) => i.status === "upcoming");
    if (upcoming.length < 2) continue; // nothing to gain from paying a single last payment early
    const remaining = sumMoney(upcoming.map((i) => i.amount));
    const last = upcoming.reduce((m, i) => (i.dueDate > m ? i.dueDate : m), upcoming[0].dueDate);

    let safeDate: ISODate | null = null;
    let payoff: number | null = null;
    for (let k = 0; k <= PAYOFF_SEARCH_DAYS; k++) {
      const date = addDays(today, k);
      // Only worth it while at least two payments are still ahead.
      if (date >= last || upcoming.filter((i) => i.dueDate >= date).length < 2) break;
      const amount = payoffAmount(plan, date);
      if (isSafe(profile, plans, withPayoff(plans, plan.id, date, amount), today)) {
        safeDate = date;
        payoff = amount;
        break;
      }
    }

    const remainingAtSafe = safeDate ? sumMoney(upcoming.filter((i) => i.dueDate >= safeDate!).map((i) => i.amount)) : 0;
    options.push({
      planId: plan.id,
      label: `${providerName(plan.provider)} · ${plan.merchant || "Purchase"}`,
      apr: plan.apr ?? 0,
      remaining,
      safeDate,
      payoffAtSafeDate: payoff,
      remainingAtSafeDate: safeDate ? remainingAtSafe : null,
      interestSaved: payoff === null ? 0 : roundMoney(remainingAtSafe - payoff),
      debtFreeBefore: before,
      debtFreeAfter: safeDate ? maxDate(debtSummary(plans.filter((p) => p.id !== plan.id)).debtFreeDate ?? safeDate, safeDate) : null,
    });
  }

  return options.sort(
    (a, b) => b.interestSaved - a.interestSaved || Number(b.safeDate !== null) - Number(a.safeDate !== null) || b.remaining - a.remaining,
  );
}
