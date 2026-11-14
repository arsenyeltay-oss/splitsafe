"use client";

import { safeToSpend } from "@/lib/engine";
import type { CashProfile, DayResult, ISODate } from "@/lib/engine";
import { formatDate, formatMoney } from "@/lib/ui-format";
import { cx } from "./ui";

/** Free daily number: how much can leave checking before payday while staying above the buffer. */
export function SafeToSpendStrip({ days, profile, today }: { days: DayResult[]; profile: CashProfile; today: ISODate }) {
  const s = safeToSpend(days, profile);
  if (!s) return null;
  const zero = s.amount === 0;
  return (
    <div
      className={cx(
        "flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4 ring-1",
        zero ? "bg-amber-50 ring-amber-200" : "bg-emerald-50 ring-emerald-200",
      )}
    >
      <div>
        <p className="text-sm font-medium text-slate-700">Safe to spend until payday ({formatDate(s.until, today)})</p>
        <p className={cx("text-3xl font-semibold tracking-tight", zero ? "text-amber-900" : "text-emerald-800")}>{formatMoney(s.amount)}</p>
      </div>
      <p className="max-w-md text-sm text-slate-700">
        {zero
          ? s.lowPoint < 0
            ? `Nothing to spare: your balance is already set to hit ${formatMoney(s.lowPoint)} on ${formatDate(s.lowPointDate, today)}. See "How to fix" below.`
            : `Nothing to spare: you're already set to dip under your ${formatMoney(profile.buffer)} buffer on ${formatDate(s.lowPointDate, today)}.`
          : `Spend up to this before your next paycheck and every day stays above your ${formatMoney(profile.buffer)} buffer. Lowest point: ${formatDate(s.lowPointDate, today)}.`}
      </p>
    </div>
  );
}
