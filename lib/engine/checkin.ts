import { addDays, daysBetween } from "./dates";
import { sumMoney } from "./money";
import { generatePaydays } from "./paydays";
import { simulate } from "./simulate";
import type { CashEvent, CashProfile, ISODate, Plan } from "./types";

type InstallmentEvent = Extract<CashEvent, { kind: "installment" }>;

export interface CheckInSummary {
  /** Date the stored balance refers to (the last check-in or setup). */
  since: ISODate;
  /** Projected balance at the start of today if everything since `since` happened as planned. */
  estimatedBalance: number;
  /** Next payday rolled forward so it is today or later. */
  nextPayday: ISODate;
  income: number;
  bills: number;
  /** BNPL payments that came due since the last visit; the user confirms each one. */
  payments: InstallmentEvent[];
}

/**
 * What happened between the last check-in and today, replayed with the same simulation as the
 * calendar. Returns null when there is nothing to catch up on.
 */
export function checkInSummary(profile: CashProfile, plans: Plan[], since: ISODate, today: ISODate): CheckInSummary | null {
  const gap = daysBetween(since, today);
  if (gap <= 0) return null;
  const days = simulate(profile, plans, since, { horizonDays: gap });
  const events = days.flatMap((d) => d.events);
  return {
    since,
    estimatedBalance: days[days.length - 1].endBalance,
    nextPayday: generatePaydays(profile.frequency, profile.nextPayday, today, addDays(today, 62))[0] ?? profile.nextPayday,
    income: sumMoney(events.filter((e) => e.kind === "income").map((e) => e.amount)),
    bills: sumMoney(events.filter((e) => e.kind === "bill").map((e) => e.amount)),
    payments: events.filter((e): e is InstallmentEvent => e.kind === "installment"),
  };
}

export interface CheckInResult {
  profile: CashProfile;
  plans: Plan[];
  paidCount: number;
  missedCount: number;
}

/**
 * Applies a confirmed check-in. Payments the user says went through are marked paid; missed ones
 * stay unpaid (the calendar then counts them as overdue today). The balance is what the user entered.
 */
export function applyCheckIn(
  profile: CashProfile,
  plans: Plan[],
  summary: CheckInSummary,
  missed: Set<number>,
  balance: number,
): CheckInResult {
  const paid = summary.payments.filter((_, i) => !missed.has(i));
  const remaining = [...paid];
  const nextPlans = plans.map((plan) => ({
    ...plan,
    installments: plan.installments.map((inst) => {
      if (inst.status !== "upcoming") return inst;
      const idx = remaining.findIndex((e) => e.planId === plan.id && e.amount === inst.amount && (e.date === inst.dueDate || (e.overdue && inst.dueDate < e.date)));
      if (idx === -1) return inst;
      remaining.splice(idx, 1);
      return { ...inst, status: "paid" as const };
    }),
  }));
  return {
    profile: { ...profile, balance, nextPayday: summary.nextPayday },
    plans: nextPlans,
    paidCount: paid.length,
    missedCount: missed.size,
  };
}

/** Share of all BNPL money already paid, across every plan (0–1). */
export function payoffProgress(plans: Plan[]): { paid: number; total: number; ratio: number } {
  const all = plans.flatMap((p) => p.installments);
  const total = sumMoney(all.map((i) => i.amount));
  const paid = sumMoney(all.filter((i) => i.status === "paid").map((i) => i.amount));
  return { paid, total, ratio: total > 0 ? paid / total : 0 };
}
