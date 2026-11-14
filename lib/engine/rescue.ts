import { addDays } from "./dates";
import { formatISOForMessage } from "./format";
import { toCents, toDollars } from "./money";
import { PROVIDERS, providerName } from "./providers";
import { collectEvents, DEFAULT_HORIZON_DAYS } from "./simulate";
import type { CashEvent, CashProfile, ISODate, Plan, ProviderId } from "./types";

/**
 * Priority tiers, lowest number = pay first.
 * 0 essentials (rent, utilities) · 1 reported to credit bureaus · 2 late fee (or unknown rules) · 3 no known penalty
 */
export type PriorityTier = 0 | 1 | 2 | 3;

export const TIER_LABEL: Record<PriorityTier, string> = {
  0: "Essentials — pay first",
  1: "Can affect your credit",
  2: "Late fee",
  3: "No known penalty",
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

function tierOf(e: Outflow): PriorityTier {
  return e.kind === "bill" ? 0 : providerTier(e.provider).tier;
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
 * Replays the next `horizonDays` with a new paycheck amount. Within each day, money in posts
 * first, then outflows in priority order (essentials, then credit-reporting BNPL, then the rest).
 * Any payment that leaves the balance below $0 is "at risk" of bouncing or overdrafting.
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
  const ordered = [...events].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.kind === "income" || b.kind === "income") return a.kind === "income" ? -1 : b.kind === "income" ? 1 : 0;
    return tierOf(a) - tierOf(b);
  });

  let balance = toCents(profile.balance);
  const atRisk: AtRiskPayment[] = [];
  for (const e of ordered) {
    if (e.kind === "income") {
      balance += toCents(e.amount);
      continue;
    }
    balance -= toCents(e.amount);
    if (balance < 0) atRisk.push({ event: e, tier: tierOf(e), balanceAfter: toDollars(balance) });
  }

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
      reason:
        e.kind === "bill"
          ? "Housing and essentials keep a roof over your head — protect these first."
          : providerTier(e.provider).reason,
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
    `I have a ${name} plan for my purchase from ${plan.merchant || "a merchant"}. My income has recently dropped, and I don't expect to have enough in my account for the payment due ${formatISOForMessage(obligation.firstAtRiskDate)} (about $${obligation.amountAtRisk.toFixed(2)} due over the coming weeks).`,
    "",
    `I want to pay this in full. Could you help me with ${ask}? I'd also like to understand how to avoid late fees${reporting} while we sort this out.`,
    "",
    "Thank you for your help.",
    "",
    "[Your name]",
    "[Email or phone on the account]",
  ].join("\n");
}
