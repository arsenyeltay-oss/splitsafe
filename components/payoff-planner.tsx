"use client";

import { useMemo } from "react";
import { payoffOptions, PAYOFF_SEARCH_DAYS } from "@/lib/engine";
import type { CashProfile, ISODate, Plan } from "@/lib/engine";
import { formatDate, formatMoney } from "@/lib/ui-format";
import { Badge, Button, Card } from "./ui";

/**
 * Plus feature: for each plan, the earliest date it can be paid off early without creating a tight or
 * short day, the estimated payoff amount and the interest saved. Free users see the headline saving.
 */
export function PayoffPlanner({
  profile,
  plans,
  today,
  isPlus,
  onNeedPlus,
}: {
  profile: CashProfile;
  plans: Plan[];
  today: ISODate;
  isPlus: boolean;
  onNeedPlus: () => void;
}) {
  const options = useMemo(() => payoffOptions(profile, plans, today), [profile, plans, today]);
  if (options.length === 0) return null;
  const best = options[0];
  const totalSaved = options.reduce((s, o) => s + o.interestSaved, 0);

  if (!isPlus) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-teal-50 to-white">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">Pay off early · Plus</p>
          <p className="mt-1 font-semibold text-slate-900">
            {best.interestSaved > 0
              ? `Paying off ${best.label} early could save about ${formatMoney(best.interestSaved)} in interest.`
              : "See which plan you can pay off early without creating a danger day."}
          </p>
          <p className="text-sm text-slate-600">Plus finds the earliest safe date for each plan and the exact payoff estimate.</p>
        </div>
        <Button onClick={onNeedPlus}>Unlock the payoff planner</Button>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Pay off early</h2>
        {totalSaved > 0 && <Badge tone="green">Up to {formatMoney(totalSaved)} interest saved</Badge>}
      </div>
      <p className="mt-1 text-sm text-slate-600">
        The earliest date in the next {PAYOFF_SEARCH_DAYS} days you could clear each plan without any day dropping under your {formatMoney(profile.buffer)} buffer.
      </p>
      <ul className="mt-4 flex flex-col gap-3">
        {options.map((o) => (
          <li key={o.planId} className="rounded-xl border border-slate-200 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-slate-900">
                {o.label}
                {o.apr > 0 && <span className="font-normal text-slate-500"> · {o.apr}% APR</span>}
              </p>
              {o.safeDate ? (
                <Badge tone="teal">Safe from {formatDate(o.safeDate, today)}</Badge>
              ) : (
                <Badge tone="amber">Not safe in the next {PAYOFF_SEARCH_DAYS} days</Badge>
              )}
            </div>
            {o.safeDate && o.payoffAtSafeDate !== null ? (
              <p className="mt-2 text-slate-700">
                Pay about <strong>{formatMoney(o.payoffAtSafeDate)}</strong> on {formatDate(o.safeDate, today)} instead of the {formatMoney(o.remainingAtSafeDate ?? o.remaining)} still scheduled after that date
                {o.interestSaved > 0 ? (
                  <>
                    {" "}
                    — saves <strong>{formatMoney(o.interestSaved)}</strong> in interest
                  </>
                ) : (
                  " — no interest to save (0% plan), but it frees up your future paychecks"
                )}
                .{o.debtFreeAfter && o.debtFreeBefore && o.debtFreeAfter < o.debtFreeBefore && (
                  <> Debt-free on {formatDate(o.debtFreeAfter, today)} instead of {formatDate(o.debtFreeBefore, today)}.</>
                )}
              </p>
            ) : (
              <p className="mt-2 text-slate-700">Paying this off early would push a day under your buffer. Keep the schedule for now.</p>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-slate-500">Payoff amounts are estimates. Ask your provider for an exact payoff quote before paying.</p>
    </Card>
  );
}
