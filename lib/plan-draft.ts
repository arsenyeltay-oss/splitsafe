import { isValidISODate, sumMoney } from "@/lib/engine";
import type { InstallmentStatus, Plan, ProviderId } from "@/lib/engine";
import { newId } from "@/lib/ui-format";

/**
 * An editable plan where anything may still be missing. Parsed plans arrive as drafts so the
 * user can fill gaps; we never fill them for the user.
 */
export interface DraftInstallment {
  dueDate: string;
  amount: number | null;
  status: InstallmentStatus;
}

export interface PlanDraft {
  id: string;
  provider: ProviderId | "";
  merchant: string;
  totalAmount: number | null;
  apr: number | null;
  installments: DraftInstallment[];
  source: Plan["source"];
  confidence?: "high" | "medium" | "low";
  /** Fields the parser could not find — highlighted until the user fills them. */
  missingFields: string[];
}

export const emptyDraft = (): PlanDraft => ({
  id: newId(),
  provider: "",
  merchant: "",
  totalAmount: null,
  apr: null,
  installments: [{ dueDate: "", amount: null, status: "upcoming" }],
  source: "manual",
  missingFields: [],
});

export const planToDraft = (p: Plan): PlanDraft => ({
  id: p.id,
  provider: p.provider,
  merchant: p.merchant,
  totalAmount: p.totalAmount,
  apr: p.apr ?? null,
  installments: p.installments.map((i) => ({ ...i })),
  source: p.source,
  missingFields: [],
});

export interface DraftProblems {
  provider?: string;
  totalAmount?: string;
  installments?: string;
  /** Index → problem for individual installment rows. */
  rows: Record<number, string>;
}

export function draftProblems(d: PlanDraft): DraftProblems {
  const problems: DraftProblems = { rows: {} };
  if (!d.provider) problems.provider = "Choose a provider";
  if (d.totalAmount == null || d.totalAmount <= 0) problems.totalAmount = "Enter the purchase total";
  if (d.installments.length === 0) problems.installments = "Add at least one payment";
  d.installments.forEach((i, idx) => {
    if (!isValidISODate(i.dueDate)) problems.rows[idx] = "Date needed";
    else if (i.amount == null || i.amount <= 0) problems.rows[idx] = "Amount needed";
  });
  return problems;
}

export const hasProblems = (p: DraftProblems): boolean =>
  Boolean(p.provider || p.totalAmount || p.installments || Object.keys(p.rows).length);

/** Converts a complete draft into a Plan, or returns null if anything is still missing. */
export function draftToPlan(d: PlanDraft): Plan | null {
  if (hasProblems(draftProblems(d))) return null;
  return {
    id: d.id,
    provider: d.provider as ProviderId,
    merchant: d.merchant.trim(),
    totalAmount: d.totalAmount!,
    apr: d.apr,
    installments: d.installments
      .map((i) => ({ dueDate: i.dueDate, amount: i.amount!, status: i.status }))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    source: d.source,
  };
}

export const draftInstallmentTotal = (d: PlanDraft): number => sumMoney(d.installments.map((i) => i.amount ?? 0));
