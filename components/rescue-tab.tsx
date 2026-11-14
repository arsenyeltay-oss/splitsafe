"use client";

import { useMemo, useState } from "react";
import { hardshipMessage, PROVIDERS, rescuePlan, TIER_LABEL } from "@/lib/engine";
import type { CashProfile, ISODate, Plan, PriorityTier, RescueObligation } from "@/lib/engine";
import { formatDate, formatMoney } from "@/lib/ui-format";
import { Badge, Button, Card, Field, Input } from "./ui";

const TIER_TONE: Record<PriorityTier, "red" | "amber" | "neutral" | "teal"> = { 0: "teal", 1: "red", 2: "amber", 3: "neutral" };

export function RescueTab({ profile, plans, today }: { profile: CashProfile; plans: Plan[]; today: ISODate }) {
  const [value, setValue] = useState(String(Math.round(profile.paycheckAmount * 0.7)));
  const [submitted, setSubmitted] = useState<number | null>(null);
  const report = useMemo(
    () => (submitted == null ? null : rescuePlan(profile, plans, today, submitted)),
    [submitted, profile, plans, today],
  );

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="text-base font-semibold text-slate-900">My income dropped</h2>
        <p className="mt-1 text-sm text-slate-600">
          Hours cut, a missed shift, a gap between jobs — it happens. Enter what you expect per paycheck and we&apos;ll show what&apos;s at risk and what to protect first.
        </p>
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(value);
            if (value.trim() !== "" && n >= 0) setSubmitted(n);
          }}
        >
          <Field label="New take-home per paycheck ($)" hint={`Currently ${formatMoney(profile.paycheckAmount)}`}>
            {(id) => <Input id={id} type="number" inputMode="decimal" min={0} step="0.01" value={value} onChange={(e) => setValue(e.target.value)} className="w-48" />}
          </Field>
          <Button type="submit">Show my rescue plan</Button>
        </form>
      </Card>

      {report && (
        <div aria-live="polite" className="flex flex-col gap-4">
          {report.priorities.length === 0 ? (
            <Card className="bg-emerald-50 ring-emerald-200">
              <p className="font-semibold text-emerald-800">Good news — every payment in the next 90 days still clears at {formatMoney(report.paycheckAmount)} per paycheck.</p>
            </Card>
          ) : (
            <>
              <Card>
                <h3 className="text-base font-semibold text-slate-900">
                  {report.atRisk.length} payment{report.atRisk.length === 1 ? "" : "s"} at risk in the next 90 days
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  In order of what to protect first. Contact providers <em>before</em> the due date — most have options, and asking early usually helps.
                </p>
                <ol className="mt-4 flex flex-col gap-3">
                  {report.priorities.map((o, i) => (
                    <PriorityRow key={o.key} rank={i + 1} obligation={o} plan={plans.find((p) => p.id === o.planId)} today={today} />
                  ))}
                </ol>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PriorityRow({ rank, obligation: o, plan, today }: { rank: number; obligation: RescueObligation; plan?: Plan; today: ISODate }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const message = plan ? hardshipMessage(plan, o) : null;

  const copy = async () => {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setOpen(true);
    }
  };

  return (
    <li className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">{rank}</span>
          <div>
            <p className="font-semibold text-slate-900">{o.label}</p>
            <p className="text-sm text-slate-700">
              {formatMoney(o.amountAtRisk)} across {o.paymentsAtRisk} payment{o.paymentsAtRisk === 1 ? "" : "s"} · first on {formatDate(o.firstAtRiskDate, today)}
            </p>
            <p className="mt-1 text-xs text-slate-500">{o.reason}</p>
          </div>
        </div>
        <Badge tone={TIER_TONE[o.tier]}>{TIER_LABEL[o.tier]}</Badge>
      </div>
      {o.kind === "bill" && o.tier === 0 && (
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-600">
          Tip: tell your landlord or biller before the due date — many will agree to a short delay or a split payment if you ask early.
        </p>
      )}
      {plan && message && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-500">Options: {PROVIDERS[plan.provider].hardshipOptions.join(" · ")}</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              {open ? "Hide message" : "Write a hardship request"}
            </Button>
            <Button size="sm" variant="ghost" onClick={copy}>
              {copied ? "Copied ✓" : "Copy message"}
            </Button>
          </div>
          {open && <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-sm text-slate-800">{message}</pre>}
        </div>
      )}
    </li>
  );
}
