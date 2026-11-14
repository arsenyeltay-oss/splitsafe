"use client";

import { useMemo, useState } from "react";
import { applyCheckIn, checkInSummary, roundMoney } from "@/lib/engine";
import type { CashProfile, ISODate, Plan } from "@/lib/engine";
import { formatDate, formatMoney } from "@/lib/ui-format";
import { Button, Card, cx, Input } from "./ui";

/**
 * The weekly return mechanic: when the user comes back, replay what was scheduled since their last
 * visit, let them confirm which BNPL payments went through and correct the balance, then the
 * calendar continues from real numbers.
 */
export function CheckInCard({
  profile,
  plans,
  since,
  today,
  onConfirm,
}: {
  profile: CashProfile;
  plans: Plan[];
  since: ISODate;
  today: ISODate;
  onConfirm: (profile: CashProfile, plans: Plan[], paid: number, missed: number) => void;
}) {
  const summary = useMemo(() => checkInSummary(profile, plans, since, today), [profile, plans, since, today]);
  const [missed, setMissed] = useState<Set<number>>(new Set());
  const [balanceEdit, setBalanceEdit] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  if (!summary || hidden) return null;

  // A missed autopay never left the account, so the estimate adds it back.
  const missedTotal = summary.payments.reduce((s, p, i) => (missed.has(i) ? s + p.amount : s), 0);
  const suggested = roundMoney(summary.estimatedBalance + missedTotal);
  const balanceText = balanceEdit ?? suggested.toFixed(2);
  const balance = Number(balanceText);
  const valid = balanceText.trim() !== "" && Number.isFinite(balance);

  const toggle = (i: number, isMissed: boolean) => {
    const next = new Set(missed);
    if (isMissed) next.add(i);
    else next.delete(i);
    setMissed(next);
  };

  const confirm = () => {
    if (!valid) return;
    const r = applyCheckIn(profile, plans, summary, missed, roundMoney(balance));
    onConfirm(r.profile, r.plans, r.paidCount, r.missedCount);
  };

  return (
    <Card className="ring-2 ring-teal-300">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">Weekly check-in</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Welcome back. Here&apos;s what was scheduled since {formatDate(summary.since, today)}.</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setHidden(true)}>
          Later
        </Button>
      </div>

      <p className="mt-2 text-sm text-slate-700">
        Paychecks <span className="font-medium text-emerald-700">+{formatMoney(summary.income)}</span> · bills{" "}
        <span className="font-medium">−{formatMoney(summary.bills)}</span> · {summary.payments.length} BNPL payment
        {summary.payments.length === 1 ? "" : "s"}
      </p>

      {summary.payments.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {summary.payments.map((p, i) => {
            const isMissed = missed.has(i);
            return (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="text-slate-800">
                  {formatDate(p.date, today)} · {p.label} · <span className="font-medium">{formatMoney(p.amount)}</span>
                </span>
                <span className="flex gap-1" role="group" aria-label={`Did the ${p.label} payment go through?`}>
                  <button
                    type="button"
                    aria-pressed={!isMissed}
                    onClick={() => toggle(i, false)}
                    className={cx("rounded-md px-2.5 py-1 font-medium", !isMissed ? "bg-emerald-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-300")}
                  >
                    ✓ Went through
                  </button>
                  <button
                    type="button"
                    aria-pressed={isMissed}
                    onClick={() => toggle(i, true)}
                    className={cx("rounded-md px-2.5 py-1 font-medium", isMissed ? "bg-amber-500 text-white" : "bg-white text-slate-600 ring-1 ring-slate-300")}
                  >
                    Missed
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {missed.size > 0 && (
        <p className="mt-2 text-sm text-amber-900">
          Missed payments stay on your calendar as due today. The Rescue tab can draft a message to the provider.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Checking balance today ($)
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            className="w-40"
            value={balanceText}
            invalid={!valid}
            onChange={(e) => setBalanceEdit(e.target.value)}
          />
        </label>
        <Button onClick={confirm} disabled={!valid}>
          Confirm and update my calendar
        </Button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Our estimate is {formatMoney(suggested)} if everything ran as scheduled. Check your bank app and correct it if it&apos;s different.
      </p>
    </Card>
  );
}
