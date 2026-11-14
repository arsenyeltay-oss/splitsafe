import { addDays } from "./dates";
import { formatISOForMessage } from "./format";
import { toCents, toDollars } from "./money";
import { PROVIDERS, providerName } from "./providers";
import { collectEvents, DEFAULT_HORIZON_DAYS } from "./simulate";
import type { CashEvent, CashProfile, ISODate, Plan, ProviderId } from "./types";

/**
 * Priority tiers, lowest number = pay first.
 * 0 essential bills (rent, utilities, insurance) · 1 BNPL reported to credit bureaus ·
 * 2 late fee (or unknown rules) · 3 no known penalty, and non-essential bills (subscriptions)
 */
export type PriorityTier = 0 | 1 | 2 | 3;

export const TIER_LABEL: Record<PriorityTier, string> = {
  0: "Essential — pay first",
  1: "Can affect your credit",
  2: "Late fee",
  3: "Lowest priority",
};

export function providerTier(provider: ProviderId): { tier: PriorityTier; reason: string } {
  const rule = PROVIDERS[provider];
  if (rule.reportsToCreditBureaus.value === true) return { tier: 1, reason: rule.reportsToCreditBureaus.description };
  if (rule.lateFee.charges === true) return { tier: 2, reason: rule.lateFee.description };
  if (rule.lateFee.charges === null || rule.reportsToCreditBureaus.value === null)
    return { tier: 2, reason: "Rules unverified — we assume a late fee could apply." };
  return { tier: 3, reason: "No late fee and no credit reporting." };
}

type Outflow = Exclude<CashEvent, { kind: "income" }>;

function priorityOf(e: Outflow): { tier: PriorityTier; reason: string } {
  if (e.kind === "installment") return providerTier(e.provider);
  return e.essential
    ? { tier: 0, reason: "Essentials like housing, utilities and insurance come first." }
    : { tier: 3, reason: "Not essential — consider pausing it this month." };
}

export interface AtRiskPayment {
  event: Outflow;
  tier: PriorityTier;
  /** Balance right after this payment if it goes through (negative = overdraft / bounce). */
  balanceAfter: number;
}

export interface RescueObligation {
  key: string;
  label: string;
  kind: "bill" | "installment";
  provider?: ProviderId;
  planId?: string;
  tier: PriorityTier;
  reason: string;
  firstAtRiskDate: ISODate;
  amountAtRisk: number;
  paymentsAtRisk: number;
}

export interface RescueReport {
  paycheckAmount: number;
  atRisk: AtRiskPayment[];
  /** One row per bill/plan with at least one at-risk payment, in the order to protect them. */
  priorities: RescueObligation[];
}

/**
 * Replays the next `horizonDays` with a new paycheck amount, one pay period at a time (a period
 * starts at each paycheck). Within a period the money is allocated by priority rather than by
 * autopay order: essentials are always reserved (even if that overdraws), then each other payment
 * is covered only if it still fits. Payments that don't fit are "at risk" — the ones to ask the
 * provider to move — and are not deducted, since the goal is to reschedule them.
 */
export function rescuePlan(
  profile: CashProfile,
  plans: Plan[],
  today: ISODate,
  newPaycheckAmount: number,
  horizonDays = DEFAULT_HORIZON_DAYS,
): RescueReport {
  const events = collectEvents(profile, plans, today, addDays(today, horizonDays - 1), {
    paycheckAmount: newPaycheckAmount,
  });

  const periods: Outflow[][] = [[]];
  const incomes: number[] = [0];
  for (const e of events) {
    if (e.kind === "income") {
      periods.push([]);
      incomes.push(toCents(e.amount));
    } else periods[periods.length - 1].push(e);
  }

  let balance = toCents(profile.balance);
  const atRisk: AtRiskPayment[] = [];
  periods.forEach((outflows, i) => {
    balance += incomes[i];
    const ordered = [...outflows].sort(
      (a, b) => priorityOf(a).tier - priorityOf(b).tier || a.date.localeCompare(b.date),
    );
    for (const e of ordered) {
      const { tier } = priorityOf(e);
      const after = balance - toCents(e.amount);
      if (after >= 0 || tier === 0) balance = after;
      if (after < 0) atRisk.push({ event: e, tier, balanceAfter: toDollars(after) });
    }
  });
  atRisk.sort((a, b) => a.event.date.localeCompare(b.event.date));

  const byKey = new Map<string, RescueObligation>();
  for (const { event: e, tier } of atRisk) {
    const key = e.kind === "bill" ? `bill:${e.billId}` : `plan:${e.planId}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.amountAtRisk = toDollars(toCents(existing.amountAtRisk) + toCents(e.amount));
      existing.paymentsAtRisk += 1;
      continue;
    }
    byKey.set(key, {
      key,
      label: e.label,
      kind: e.kind,
      provider: e.kind === "installment" ? e.provider : undefined,
      planId: e.kind === "installment" ? e.planId : undefined,
      tier,
      reason: priorityOf(e).reason,
      firstAtRiskDate: e.date,
      amountAtRisk: e.amount,
      paymentsAtRisk: 1,
    });
  }

  const priorities = [...byKey.values()].sort((a, b) =>
    a.tier !== b.tier ? a.tier - b.tier : a.firstAtRiskDate.localeCompare(b.firstAtRiskDate),
  );
  return { paycheckAmount: newPaycheckAmount, atRisk, priorities };
}

/** A polite, plain-language hardship / extension request for one plan. */
export function hardshipMessage(
  plan: Plan,
  obligation: Pick<RescueObligation, "firstAtRiskDate" | "amountAtRisk">,
): string {
  const name = providerName(plan.provider);
  const ask =
    plan.provider === "klarna"
      ? "a payment extension"
      : plan.provider === "afterpay"
        ? "help through your hardship program, or a later payment date"
        : "a short extension or a modified payment schedule";
  const reporting = PROVIDERS[plan.provider].reportsToCreditBureaus.value === false ? "" : " or credit reporting";
  return [
    `Hi ${name} team,`,
    "",
    `I have a payment plan with ${name} for my purchase from ${plan.merchant || "a merchant"}. My income has recently dropped, and I don't expect to have enough in my account for the payment due ${formatISOForMessage(obligation.firstAtRiskDate)} (about $${obligation.amountAtRisk.toFixed(2)} due over the coming weeks).`,
    "",
    `I want to pay this in full. Could you help me with ${ask}? I'd also like to understand how to avoid late fees${reporting} while we sort this out.`,
    "",
    "Thank you for your help.",
    "",
    "[Your name]",
    "[Email or phone on the account]",
  ].join("\n");
}
