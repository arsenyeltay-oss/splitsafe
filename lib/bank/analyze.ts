import { addDays, daysBetween, generatePaydays, roundMoney, yearMonth } from "@/lib/engine";
import type { ISODate, PayFrequency, ProviderId } from "@/lib/engine";
import type { PlanDraft } from "@/lib/plan-draft";
import type { BankTxn } from "./csv";

/**
 * Turns bank transactions into a cash-flow profile and BNPL plan drafts, entirely on-device.
 * Deterministic rules only; anything we can't establish is left for the user to confirm.
 */

const BNPL_PATTERNS: [ProviderId, RegExp][] = [
  ["klarna", /KLARNA/i],
  ["affirm", /AFFIRM/i],
  ["afterpay", /AFTERPAY|CLEARPAY/i],
  ["sezzle", /SEZZLE/i],
  ["zip", /\bZIP\.?CO\b|\bZIPPAY\b|QUADPAY/i],
  ["paypal", /PAYPAL.*(PAY ?IN ?4|INSTAL|PI4)|PAY IN 4/i],
];
const PAYROLL = /PAYROLL|DIR(ECT)? ?DEP|SALARY|PAYCHECK|\bPAYRL\b/i;
/** Moving money between your own accounts isn't income or spending. */
const OWN_TRANSFER = /TRANSFER (TO|FROM) (SAV|SAVINGS|CHK|CHECKING)|TO SAVINGS|FROM SAVINGS/i;
const ESSENTIAL = /RENT|MORTGAGE|LANDLORD|PROPERTY|APARTMENT|APTS|ELECTRIC|POWER|ENERGY|WATER|UTILIT|GAS CO|INSURANCE|INSUR|GEICO|PROGRESSIVE|STATE FARM|ALLSTATE|VERIZON|AT&T|\bATT\b|T-MOBILE|TMOBILE|COMCAST|XFINITY|SPECTRUM|INTERNET|PHONE|STUDENT LOAN|CAR PAYMENT|AUTO LOAN|DAYCARE|CHILDCARE|GROCER|KROGER|SAFEWAY|WALMART|COSTCO|ALDI|PUBLIX|TRADER JOE/i;

export function bnplProvider(description: string): ProviderId | null {
  return BNPL_PATTERNS.find(([, re]) => re.test(description))?.[0] ?? null;
}

/** Stable grouping key: letters only, first four words. "ACME CORP PAYROLL PPD ID: 123" → "ACME CORP PAYROLL PPD". */
export function merchantKey(description: string): string {
  return description.toUpperCase().replace(/[^A-Z&]+/g, " ").trim().split(/\s+/).slice(0, 4).join(" ");
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** Words banks add around the real payee name. */
const NOISE = new Set(["ZELLE", "PAYMENT", "PAYMENTS", "PMT", "TO", "FROM", "ONLINE", "ACH", "DEBIT", "CREDIT", "POS", "PURCHASE", "CARD", "WEB", "PPD", "ID", "LLC", "INC", "CO", "COM", "RECURRING", "AUTOPAY", "BILL", "PAY"]);

/** Human name for a payee: "ZELLE PAYMENT TO OAKWOOD APTS LLC" → "Oakwood Apts", "NETFLIX.COM" → "Netflix". */
export function payeeName(description: string): string {
  const words = description.toUpperCase().replace(/[^A-Z&]+/g, " ").trim().split(/\s+/).filter((w) => w && !NOISE.has(w));
  // Keep three real words; "&" joins words and doesn't count ("City Power & Light").
  const kept: string[] = [];
  for (const w of words) {
    if (kept.filter((k) => k !== "&").length === 3) break;
    kept.push(w);
  }
  if (kept.at(-1) === "&") kept.pop();
  return titleCase(kept.join(" ")) || titleCase(merchantKey(description));
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};

const gaps = (dates: ISODate[]) => dates.slice(1).map((d, i) => daysBetween(dates[i], d));

function frequencyFromGaps(dates: ISODate[]): PayFrequency | null {
  const g = median(gaps(dates));
  if (g >= 6 && g <= 8) return "weekly";
  if (g >= 13 && g <= 17) {
    // Twice-a-month pay lands on fixed days of the month; every-two-weeks drifts.
    const days = new Set(dates.map((d) => yearMonth(d).day));
    return days.size <= 3 && dates.length >= 3 ? "semimonthly" : "biweekly";
  }
  if (g >= 27 && g <= 33) return "monthly";
  return null;
}

export interface DetectedPaycheck {
  amount: number;
  frequency: PayFrequency;
  nextPayday: ISODate;
  source: string;
  occurrences: number;
}

export interface DetectedBill {
  name: string;
  amount: number;
  dayOfMonth: number;
  essential: boolean;
  occurrences: number;
}

export interface StatementAnalysis {
  from: ISODate;
  to: ISODate;
  transactions: number;
  balance: { amount: number; asOf: ISODate } | null;
  paycheck: DetectedPaycheck | null;
  bills: DetectedBill[];
  /** Average monthly spending that isn't a recurring bill or BNPL (groceries, gas, coffee…). */
  everydayPerMonth: number;
  plans: PlanDraft[];
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) m.set(key(it), [...(m.get(key(it)) ?? []), it]);
  return m;
}

const withinPct = (xs: number[], pct: number) => {
  const m = median(xs);
  return xs.every((x) => Math.abs(x - m) <= m * pct);
};

function latestBalance(txns: BankTxn[]): StatementAnalysis["balance"] {
  const withBal = txns.filter((t) => t.balance !== null);
  if (!withBal.length) return null;
  const last = withBal.reduce((a, b) => (b.date > a.date ? b : a));
  // Several rows on the last day: the bank's running balance is the one after all of them,
  // i.e. the first listed for newest-first exports and the last listed for oldest-first ones.
  const sameDay = withBal.filter((t) => t.date === last.date);
  const newestFirst = txns[0].date >= txns[txns.length - 1].date;
  const pick = newestFirst ? sameDay[0] : sameDay[sameDay.length - 1];
  return { amount: pick.balance!, asOf: pick.date };
}

function detectPaycheck(credits: BankTxn[], today: ISODate): DetectedPaycheck | null {
  const candidates = [...groupBy(credits, (t) => merchantKey(t.description)).values()]
    .filter((g) => g.length >= 2 && withinPct(g.map((t) => t.amount), 0.15))
    .map((g) => [...g].sort((a, b) => a.date.localeCompare(b.date)))
    .filter((g) => frequencyFromGaps(g.map((t) => t.date)) !== null)
    .sort((a, b) => Number(PAYROLL.test(b[0].description)) - Number(PAYROLL.test(a[0].description)) || median(b.map((t) => t.amount)) - median(a.map((t) => t.amount)));
  const g = candidates[0];
  if (!g) return null;
  const frequency = frequencyFromGaps(g.map((t) => t.date))!;
  const last = g[g.length - 1];
  return {
    amount: last.amount,
    frequency,
    nextPayday: generatePaydays(frequency, last.date, addDays(today, 0), addDays(today, 62)).find((d) => d > last.date) ?? addDays(last.date, 14),
    source: payeeName(last.description),
    occurrences: g.length,
  };
}

function detectBills(debits: BankTxn[]): DetectedBill[] {
  const bills: DetectedBill[] = [];
  for (const g of groupBy(debits, (t) => merchantKey(t.description)).values()) {
    const sorted = [...g].sort((a, b) => a.date.localeCompare(b.date));
    const months = new Set(sorted.map((t) => t.date.slice(0, 7)));
    if (sorted.length < 2 || months.size < 2) continue;
    const gap = median(gaps(sorted.map((t) => t.date)));
    const amounts = sorted.map((t) => -t.amount);
    if (gap < 26 || gap > 35 || !withinPct(amounts, 0.2)) continue;
    const last = sorted[sorted.length - 1];
    bills.push({
      name: payeeName(last.description),
      amount: -last.amount,
      dayOfMonth: yearMonth(last.date).day,
      essential: ESSENTIAL.test(last.description),
      occurrences: sorted.length,
    });
  }
  return bills.sort((a, b) => b.amount - a.amount);
}

function merchantFromDescriptor(description: string): string {
  const after = description.split("*")[1];
  return after ? titleCase(after.replace(/[^A-Za-z&' ]+/g, " ").trim().split(/\s+/).slice(0, 3).join(" ")) : "";
}

/**
 * BNPL payments grouped by provider, merchant and payment amount. Pay in 4 providers repeat every
 * two weeks four times, so the remaining payments follow from the product's own rule (flagged for
 * the user to check). Monthly plans' length isn't in a statement, so it's left for the user.
 */
function detectPlans(bnpl: { txn: BankTxn; provider: ProviderId }[], idPrefix: string): PlanDraft[] {
  const drafts: PlanDraft[] = [];
  const groups = groupBy(bnpl, ({ txn, provider }) => `${provider}|${merchantFromDescriptor(txn.description)}|${-txn.amount}`);
  let n = 0;
  for (const g of groups.values()) {
    const sorted = [...g].sort((a, b) => a.txn.date.localeCompare(b.txn.date));
    const { provider } = sorted[0];
    const amount = -sorted[0].txn.amount;
    if (amount <= 0) continue;
    const dates = sorted.map((x) => x.txn.date);
    const gap = dates.length > 1 ? median(gaps(dates)) : null;
    const monthly = provider === "affirm" ? gap === null || gap > 20 : gap !== null && gap > 20;
    const paid = dates.map((d) => ({ dueDate: d, amount, status: "paid" as const }));
    const merchant = merchantFromDescriptor(sorted[0].txn.description);

    if (!monthly) {
      if (paid.length >= 4) continue; // finished
      const last = dates[dates.length - 1];
      const remaining = Array.from({ length: 4 - paid.length }, (_, i) => ({ dueDate: addDays(last, 14 * (i + 1)), amount, status: "upcoming" as const }));
      drafts.push({
        id: `${idPrefix}-${n++}`,
        provider,
        merchant,
        totalAmount: roundMoney(amount * 4),
        apr: null,
        installments: [...paid, ...remaining],
        source: "parsed",
        confidence: "medium",
        missingFields: merchant ? ["remaining dates are estimated (Pay in 4 = every 2 weeks) — check them"] : ["merchant", "remaining dates are estimated — check them"],
      });
    } else {
      drafts.push({
        id: `${idPrefix}-${n++}`,
        provider,
        merchant,
        totalAmount: null,
        apr: null,
        installments: [...paid, { dueDate: "", amount, status: "upcoming" }],
        source: "parsed",
        confidence: "low",
        missingFields: ["purchase total", "remaining payments (not in a bank statement)"],
      });
    }
  }
  return drafts;
}

export function analyzeStatement(txns: BankTxn[], today: ISODate, idPrefix = `bank-${Date.now()}`): StatementAnalysis {
  const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
  const tagged = txns.map((t) => ({ txn: t, provider: bnplProvider(t.description) }));
  const bnpl = tagged.filter((x): x is { txn: BankTxn; provider: ProviderId } => x.provider !== null && x.txn.amount < 0);
  const other = tagged.filter((x) => x.provider === null && !OWN_TRANSFER.test(x.txn.description)).map((x) => x.txn);

  const debits = other.filter((t) => t.amount < 0);
  const bills = detectBills(debits);
  const billNames = new Set(bills.map((b) => b.name));
  const variable = debits.filter((t) => !billNames.has(payeeName(t.description)));
  const spanDays = Math.max(1, daysBetween(sorted[0].date, sorted[sorted.length - 1].date) + 1);

  return {
    from: sorted[0].date,
    to: sorted[sorted.length - 1].date,
    transactions: txns.length,
    balance: latestBalance(txns),
    paycheck: detectPaycheck(other.filter((t) => t.amount > 0), today),
    bills,
    everydayPerMonth: spanDays >= 28 ? Math.max(0, roundMoney((-variable.reduce((s, t) => s + t.amount, 0) / spanDays) * (365.25 / 12))) : 0,
    plans: detectPlans(bnpl, idPrefix),
  };
}

/**
 * True when a plan found in a statement is one the user already has: same provider, same merchant,
 * and at least one payment with the same date and amount. Used so re-importing a newer statement
 * only adds plans that are actually new.
 */
export function isSameBnplPlan(draft: PlanDraft, plan: { provider: string; merchant: string; installments: { dueDate: string; amount: number }[] }): boolean {
  if (draft.provider !== plan.provider) return false;
  if (draft.merchant.trim().toLowerCase() !== plan.merchant.trim().toLowerCase()) return false;
  return draft.installments.some((i) => i.dueDate && plan.installments.some((j) => j.dueDate === i.dueDate && j.amount === i.amount));
}
