"use client";

import { useState } from "react";
import { monthlySchedule, payIn4Schedule, PROVIDERS, PROVIDER_IDS, roundMoney } from "@/lib/engine";
import type { ProviderId } from "@/lib/engine";
import { draftInstallmentTotal, draftProblems, type PlanDraft } from "@/lib/plan-draft";
import { formatMoney, localToday } from "@/lib/ui-format";
import { Badge, Button, Field, Input, Select } from "./ui";

const numOrNull = (v: string): number | null => (v.trim() === "" || Number.isNaN(Number(v)) ? null : roundMoney(Number(v)));

/** Editable form for one plan. Missing values are highlighted rather than guessed. */
export function PlanEditor({ draft, onChange, showProblems }: { draft: PlanDraft; onChange: (d: PlanDraft) => void; showProblems: boolean }) {
  const problems = draftProblems(draft);
  const flag = (cond: unknown) => showProblems && Boolean(cond);
  const set = <K extends keyof PlanDraft>(key: K, value: PlanDraft[K]) => onChange({ ...draft, [key]: value });
  const setRow = (idx: number, patch: Partial<PlanDraft["installments"][number]>) =>
    set("installments", draft.installments.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const installmentTotal = draftInstallmentTotal(draft);
  const mismatch =
    draft.totalAmount != null && draft.apr == null && draft.installments.every((i) => i.amount != null) && Math.abs(installmentTotal - draft.totalAmount) > 0.05;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Field label="Provider">
          {(id) => (
            <Select
              id={id}
              value={draft.provider}
              onChange={(e) => set("provider", e.target.value as ProviderId)}
              className={flag(problems.provider) ? "border-amber-500 bg-amber-50" : undefined}
            >
              <option value="">Choose…</option>
              {PROVIDER_IDS.map((p) => (
                <option key={p} value={p}>
                  {PROVIDERS[p].name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Merchant">
          {(id) => <Input id={id} value={draft.merchant} placeholder="e.g. Nike" onChange={(e) => set("merchant", e.target.value)} />}
        </Field>
        <Field label="Purchase total ($)">
          {(id) => (
            <Input
              id={id}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={draft.totalAmount ?? ""}
              invalid={flag(problems.totalAmount)}
              onChange={(e) => set("totalAmount", numOrNull(e.target.value))}
            />
          )}
        </Field>
        <Field label="APR % (optional)">
          {(id) => (
            <Input
              id={id}
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.01"
              value={draft.apr ?? ""}
              onChange={(e) => set("apr", numOrNull(e.target.value))}
            />
          )}
        </Field>
      </div>

      <ScheduleHelper draft={draft} onChange={onChange} />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-800">Payments</h4>
          <span className="text-xs text-slate-500">Sum: {formatMoney(installmentTotal)}</span>
        </div>
        <div className="flex flex-col gap-2">
          {draft.installments.map((row, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-2">
              <Input
                type="date"
                aria-label={`Payment ${idx + 1} due date`}
                value={row.dueDate}
                invalid={flag(problems.rows[idx] === "Date needed")}
                onChange={(e) => setRow(idx, { dueDate: e.target.value })}
              />
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                aria-label={`Payment ${idx + 1} amount`}
                placeholder="Amount"
                value={row.amount ?? ""}
                invalid={flag(problems.rows[idx] === "Amount needed")}
                onChange={(e) => setRow(idx, { amount: numOrNull(e.target.value) })}
              />
              <label className="flex items-center gap-1.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-teal-700"
                  checked={row.status === "paid"}
                  onChange={(e) => setRow(idx, { status: e.target.checked ? "paid" : "upcoming" })}
                />
                Paid
              </label>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove payment ${idx + 1}`}
                onClick={() => set("installments", draft.installments.filter((_, i) => i !== idx))}
              >
                ✕
              </Button>
            </div>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => set("installments", [...draft.installments, { dueDate: "", amount: null, status: "upcoming" }])}
        >
          + Add payment
        </Button>
        {showProblems && problems.installments && <p className="mt-1 text-sm text-amber-800">{problems.installments}</p>}
        {mismatch && (
          <p className="mt-1 text-sm text-amber-800">
            Payments add up to {formatMoney(installmentTotal)}, not {formatMoney(draft.totalAmount!)}. Double-check the amounts.
          </p>
        )}
      </div>
    </div>
  );
}

/** Fills the payments table from a standard pay-in-4 or monthly schedule. */
function ScheduleHelper({ draft, onChange }: { draft: PlanDraft; onChange: (d: PlanDraft) => void }) {
  const [kind, setKind] = useState<"payin4" | "monthly">("payin4");
  const [start, setStart] = useState(localToday());
  const [months, setMonths] = useState(6);
  const total = draft.totalAmount;

  const generate = () => {
    if (total == null || total <= 0 || !start) return;
    const installments = kind === "payin4" ? payIn4Schedule(total, start) : monthlySchedule(total, months, draft.apr ?? 0, start);
    const today = localToday();
    onChange({ ...draft, installments: installments.map((i) => ({ ...i, status: i.dueDate < today ? "paid" : "upcoming" })) });
  };

  return (
    <details className="rounded-lg bg-slate-50 p-3 text-sm">
      <summary className="cursor-pointer font-medium text-slate-700">Fill payments from a standard schedule</summary>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Field label="Type">
          {(id) => (
            <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as "payin4" | "monthly")}>
              <option value="payin4">Pay in 4 (every 2 weeks)</option>
              <option value="monthly">Monthly</option>
            </Select>
          )}
        </Field>
        <Field label="Purchase date">{(id) => <Input id={id} type="date" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
        {kind === "monthly" && (
          <Field label="Months">
            {(id) => <Input id={id} type="number" min={1} max={60} value={months} onChange={(e) => setMonths(Math.max(1, Number(e.target.value) || 1))} />}
          </Field>
        )}
        <Button variant="secondary" onClick={generate} disabled={total == null || total <= 0}>
          Fill payments
        </Button>
        {(total == null || total <= 0) && <Badge tone="amber">Enter the purchase total first</Badge>}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Payments dated before today are marked paid — uncheck any you haven&apos;t paid yet.
      </p>
    </details>
  );
}
