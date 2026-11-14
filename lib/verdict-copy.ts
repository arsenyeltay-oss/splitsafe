import { DEFAULT_ALTERNATIVE_APR, PROVIDERS } from "@/lib/engine";
import type { AffordabilityReport, ISODate, PurchaseInput } from "@/lib/engine";
import { formatDate, formatMoney } from "@/lib/ui-format";

export interface VerdictCopy {
  tone: "safe" | "tight" | "no";
  title: string;
  detail: string;
  suggestion: string | null;
}

/** Plain-language verdict, shared by the dashboard demo checkout and the browser extension. */
export function verdictCopy(input: PurchaseInput, report: AffordabilityReport, today: ISODate, buffer: number): VerdictCopy {
  const name = PROVIDERS[input.provider].name;
  const what = `${formatMoney(input.amount)} with ${name}`;
  const p = report.firstProblem;

  const suggestions: string[] = [];
  if (report.earliestSafeDate) suggestions.push(`Safe to buy on ${formatDate(report.earliestSafeDate, today)}`);
  if (report.saferTerm) {
    const t = report.saferTerm.term;
    const assumed = t.kind === "monthly" && input.term.kind === "payin4" ? ` (at ~${DEFAULT_ALTERNATIVE_APR}% APR)` : "";
    suggestions.push(t.kind === "payin4" ? "Pay in 4 would be safe today" : `${t.months} monthly payments${assumed} would be safe today`);
  }
  const suggestion = suggestions.length ? `${suggestions.join(" · ")}.` : null;

  if (report.verdict === "NO" && p) {
    return {
      tone: "no",
      title: "Not right now",
      detail:
        `${what} would leave you ${formatMoney(p.gap)} short on ${formatDate(p.date, today)}.` +
        (report.preexistingShortDays > 0 ? " You're already short then without it — this makes it deeper." : ""),
      suggestion,
    };
  }
  if (report.verdict === "TIGHT" && p) {
    return {
      tone: "tight",
      title: "Tight",
      detail: `${what} would drop you to ${formatMoney(p.endBalance)} on ${formatDate(p.date, today)}, under your ${formatMoney(buffer)} buffer.`,
      suggestion,
    };
  }
  const already = report.preexistingShortDays;
  return {
    tone: "safe",
    title: "You can afford this",
    detail:
      already > 0
        ? `${what} doesn't push any day below your ${formatMoney(buffer)} buffer that wasn't already there. Heads-up: your calendar has ${already} short day${already === 1 ? "" : "s"} without it.`
        : `${what} keeps every day above your ${formatMoney(buffer)} buffer.`,
    suggestion: null,
  };
}
