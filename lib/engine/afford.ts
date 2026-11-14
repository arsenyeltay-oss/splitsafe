import { addDays, daysBetween } from "./dates";
import { roundMoney, sumMoney } from "./money";
import { monthlySchedule, payIn4Schedule } from "./schedule";
import { DEFAULT_HORIZON_DAYS, simulate } from "./simulate";
import type { CashProfile, DayResult, Installment, ISODate, Plan, ProviderId } from "./types";

export type PurchaseTerm = { kind: "payin4" } | { kind: "monthly"; months: number; apr: number };

export interface PurchaseInput {
  amount: number;
  provider: ProviderId;
  term: PurchaseTerm;
}

export type Verdict = "SAFE" | "TIGHT" | "NO";

export interface ProblemDay {
  date: ISODate;
  endBalance: number;
  /** Below $0 (for NO) or below the buffer (for TIGHT). */
  gap: number;
}

export interface AffordabilityResult {
  verdict: Verdict;
  /** First day this purchase pushes (or keeps pushing) the balance below $0 / the buffer. */
  firstProblem: ProblemDay | null;
  installments: Installment[];
  totalCost: number;
  /** Danger days that exist with or without this purchase. */
  preexistingShortDays: number;
}

export interface AffordabilityReport extends AffordabilityResult {
  /** Earliest start date within the search window that gives SAFE, if any (only when not SAFE). */
  earliestSafeDate: ISODate | null;
  /** A different term that is SAFE starting today, if any (only when not SAFE). */
  saferTerm: { term: PurchaseTerm; result: AffordabilityResult } | null;
}

export const SAFE_DATE_SEARCH_DAYS = 60;
const ALTERNATIVE_MONTHS = [3, 6, 12];
/** APR assumed for monthly alternatives when the user asked about pay-in-4 (shown in the UI). */
export const DEFAULT_ALTERNATIVE_APR = 15;

export function hypotheticalPlan(input: PurchaseInput, start: ISODate): Plan {
  const installments =
    input.term.kind === "payin4"
      ? payIn4Schedule(input.amount, start)
      : monthlySchedule(input.amount, input.term.months, input.term.apr, start);
  return {
    id: "hypothetical",
    provider: input.provider,
    merchant: "New purchase",
    totalAmount: input.amount,
    apr: input.term.kind === "monthly" ? input.term.apr : null,
    installments,
    source: "manual",
  };
}

/** Horizon long enough to see every installment plus a couple of weeks after the last one. */
function horizonFor(today: ISODate, plan: Plan): number {
  const last = plan.installments[plan.installments.length - 1].dueDate;
  return Math.max(DEFAULT_HORIZON_DAYS, daysBetween(today, last) + 15);
}

/**
 * Judges the purchase by the damage it does, not by problems that already exist:
 * NO    — on some day the balance is below $0 and lower than it would be without the purchase.
 * TIGHT — never short because of it, but it pulls some day below the buffer.
 * SAFE  — otherwise.
 */
export function assessPurchase(
  profile: CashProfile,
  plans: Plan[],
  input: PurchaseInput,
  today: ISODate,
  start: ISODate = today,
): AffordabilityResult {
  const plan = hypotheticalPlan(input, start);
  const horizonDays = horizonFor(today, plan);
  const baseline = simulate(profile, plans, today, { horizonDays });
  const withPlan = simulate(profile, [...plans, plan], today, { horizonDays });

  const worse = (d: DayResult, i: number) => d.endBalance < baseline[i].endBalance;
  const shortIdx = withPlan.findIndex((d, i) => d.endBalance < 0 && worse(d, i));
  const tightIdx = withPlan.findIndex((d, i) => d.endBalance < profile.buffer && worse(d, i));

  let verdict: Verdict = "SAFE";
  let firstProblem: ProblemDay | null = null;
  if (shortIdx >= 0) {
    verdict = "NO";
    const d = withPlan[shortIdx];
    firstProblem = { date: d.date, endBalance: d.endBalance, gap: roundMoney(-d.endBalance) };
  } else if (tightIdx >= 0) {
    verdict = "TIGHT";
    const d = withPlan[tightIdx];
    firstProblem = { date: d.date, endBalance: d.endBalance, gap: roundMoney(profile.buffer - d.endBalance) };
  }

  return {
    verdict,
    firstProblem,
    installments: plan.installments,
    totalCost: sumMoney(plan.installments.map((i) => i.amount)),
    preexistingShortDays: baseline.filter((d) => d.status === "short").length,
  };
}

/** Earliest start date in (today, today + windowDays] at which the purchase is SAFE. */
export function findEarliestSafeDate(
  profile: CashProfile,
  plans: Plan[],
  input: PurchaseInput,
  today: ISODate,
  windowDays = SAFE_DATE_SEARCH_DAYS,
): ISODate | null {
  for (let i = 1; i <= windowDays; i++) {
    const start = addDays(today, i);
    if (assessPurchase(profile, plans, input, today, start).verdict === "SAFE") return start;
  }
  return null;
}

function alternativeTerms(term: PurchaseTerm): PurchaseTerm[] {
  const apr = term.kind === "monthly" ? term.apr : DEFAULT_ALTERNATIVE_APR;
  const options: PurchaseTerm[] = [{ kind: "payin4" }, ...ALTERNATIVE_MONTHS.map((months) => ({ kind: "monthly" as const, months, apr }))];
  return options.filter((t) => !(t.kind === term.kind && (t.kind === "payin4" || (term.kind === "monthly" && t.months === term.months))));
}

/** Full answer to "Can I afford this?" */
export function checkAffordability(profile: CashProfile, plans: Plan[], input: PurchaseInput, today: ISODate): AffordabilityReport {
  const result = assessPurchase(profile, plans, input, today);
  if (result.verdict === "SAFE") return { ...result, earliestSafeDate: null, saferTerm: null };

  let saferTerm: AffordabilityReport["saferTerm"] = null;
  for (const term of alternativeTerms(input.term)) {
    const alt = assessPurchase(profile, plans, { ...input, term }, today);
    if (alt.verdict === "SAFE") {
      saferTerm = { term, result: alt };
      break;
    }
  }
  return { ...result, earliestSafeDate: findEarliestSafeDate(profile, plans, input, today), saferTerm };
}
