import { addDays } from "./dates";
import { formatISOForMessage } from "./format";
import { nextDangerDay, type DangerDay } from "./insights";
import { roundMoney, sumMoney } from "./money";
import { generatePaydays } from "./paydays";
import { providerName } from "./providers";
import { simulate } from "./simulate";
import type { CashProfile, DayResult, ISODate, Plan, ProviderId } from "./types";

export type FixAction =
  | { kind: "move"; planId: string; provider: ProviderId; label: string; amount: number; from: ISODate; to: ISODate }
  | { kind: "pause"; billId: string; label: string; amount: number; date: ISODate };

export interface Fix {
  actions: FixAction[];
  /** Lowest end-of-day balance in the danger window once the fix is applied. */
  lowestBalance: number;
}

export interface FixReport {
  danger: DangerDay;
  /** First payday after the danger day: moved payments land here. */
  moveTo: ISODate;
  /** Up to `limit` fixes that clear the window, fewest actions first. */
  fixes: Fix[];
  /** Always-true fallback: extra cash needed before the danger day. */
  cashNeeded: number;
}

const MAX_ACTIONS = 3;
const MAX_CANDIDATES = 10;

function withActions(profile: CashProfile, plans: Plan[], actions: FixAction[]): { profile: CashProfile; plans: Plan[] } {
  const moves = actions.filter((a): a is Extract<FixAction, { kind: "move" }> => a.kind === "move");
  const paused = new Set(actions.filter((a) => a.kind === "pause").map((a) => (a as Extract<FixAction, { kind: "pause" }>).billId));
  return {
    // A paused bill is skipped for this window only: it becomes a one-month gap, modelled by
    // excluding it from the window simulation (the full calendar is unchanged).
    profile: paused.size ? { ...profile, bills: profile.bills.filter((b) => !paused.has(b.id)) } : profile,
    plans: plans.map((p) => {
      const mine = moves.filter((m) => m.planId === p.id);
      if (!mine.length) return p;
      return {
        ...p,
        installments: p.installments.map((i) => {
          const m = mine.find((x) => x.from === i.dueDate && x.amount === i.amount && i.status === "upcoming");
          return m ? { ...i, dueDate: m.to } : i;
        }),
      };
    }),
  };
}

function subsets<T>(items: T[], maxSize: number): T[][] {
  const out: T[][] = [];
  const walk = (start: number, acc: T[]) => {
    if (acc.length) out.push(acc);
    if (acc.length === maxSize) return;
    for (let i = start; i < items.length; i++) walk(i + 1, [...acc, items[i]]);
  };
  walk(0, []);
  return out;
}

/**
 * Concrete ways to clear the next danger day: ask a provider to move a payment to the next payday,
 * pause a non-essential bill this month, or a small combination of those. A fix only counts if no
 * day from today until that payday falls below the threshold (below $0 for a short day, below the
 * buffer for a tight one) and it doesn't create a new short day later in the 90-day window.
 */
export function suggestFixes(profile: CashProfile, plans: Plan[], today: ISODate, limit = 3): FixReport | null {
  const baseline = simulate(profile, plans, today);
  const danger = nextDangerDay(baseline, profile.buffer);
  if (!danger) return null;

  const moveTo = generatePaydays(profile.frequency, profile.nextPayday, addDays(danger.date, 1), addDays(danger.date, 62))[0] ?? addDays(danger.date, 14);
  const threshold = danger.status === "short" ? 0 : profile.buffer;
  const windowEnd = addDays(moveTo, -1);
  const lowestInWindow = (days: DayResult[]) => Math.min(...days.filter((d) => d.date <= windowEnd).map((d) => d.endBalance));
  const shortDates = (days: DayResult[]) => new Set(days.filter((d) => d.status === "short").map((d) => d.date));
  const baselineShort = shortDates(baseline);

  const candidates: FixAction[] = [];
  for (const d of baseline) {
    if (d.date > windowEnd) break;
    for (const e of d.events) {
      if (e.kind === "bill" && !e.essential) candidates.push({ kind: "pause", billId: e.billId, label: e.label, amount: e.amount, date: d.date });
      if (e.kind === "installment") {
        const plan = plans.find((p) => p.id === e.planId);
        const inst = plan?.installments.find((i) => i.status === "upcoming" && i.amount === e.amount && (i.dueDate === d.date || (e.overdue && i.dueDate < today)));
        if (inst) candidates.push({ kind: "move", planId: e.planId, provider: e.provider, label: e.label, amount: e.amount, from: inst.dueDate, to: moveTo });
      }
    }
  }
  // Keep the biggest levers if there are many small payments.
  const pool = candidates.sort((a, b) => b.amount - a.amount).slice(0, MAX_CANDIDATES);

  const found: Fix[] = [];
  for (const combo of subsets(pool, MAX_ACTIONS)) {
    const applied = withActions(profile, plans, combo);
    const days = simulate(applied.profile, applied.plans, today);
    const low = lowestInWindow(days);
    if (low < threshold) continue;
    const newShort = [...shortDates(days)].some((date) => !baselineShort.has(date));
    if (newShort) continue;
    found.push({ actions: combo, lowestBalance: roundMoney(low) });
  }

  // Fewest actions first; then prefer pausing bills (no one to ask), then the smallest total moved.
  const score = (f: Fix) => [f.actions.length, f.actions.filter((a) => a.kind === "move").length, sumMoney(f.actions.map((a) => a.amount))];
  found.sort((a, b) => {
    const [x, y] = [score(a), score(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  });
  // Drop fixes that just add actions on top of a smaller fix already listed.
  const key = (a: FixAction) => (a.kind === "move" ? `m:${a.planId}:${a.from}` : `p:${a.billId}:${a.date}`);
  const picked: Fix[] = [];
  for (const f of found) {
    const keys = new Set(f.actions.map(key));
    if (picked.some((p) => p.actions.every((a) => keys.has(key(a))))) continue;
    picked.push(f);
    if (picked.length === limit) break;
  }

  return { danger, moveTo, fixes: picked, cashNeeded: roundMoney(threshold - lowestInWindow(baseline)) };
}

/** A short, polite request to move one payment to payday. */
export function moveRequestMessage(plan: Plan, action: Extract<FixAction, { kind: "move" }>): string {
  const name = providerName(plan.provider);
  return [
    `Hi ${name} team,`,
    "",
    `I have a payment of $${action.amount.toFixed(2)} due ${formatISOForMessage(action.from)} for my ${plan.merchant || "purchase"} plan. My paycheck arrives ${formatISOForMessage(action.to)}, and I want to make sure the payment goes through.`,
    "",
    `Could you move this payment to ${formatISOForMessage(action.to)}? I'm happy to keep the rest of the schedule as it is.`,
    "",
    "Thank you!",
    "",
    "[Your name]",
    "[Email or phone on the account]",
  ].join("\n");
}
