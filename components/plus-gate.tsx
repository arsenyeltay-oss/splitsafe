"use client";

import { useMemo } from "react";
import { daysBetween, nextDangerDay, simulate } from "@/lib/engine";
import type { CashProfile, ISODate, Plan } from "@/lib/engine";
import { PRICES, TRIAL_DAYS } from "@/lib/pricing";
import { Button, Card } from "./ui";

/**
 * Locked view of a Plus feature. On the calendar it shows a real teaser computed from the user's own
 * data (how many short days, how soon), so the value is concrete before the trial starts.
 */
export function PlusGate({
  title,
  body,
  profile,
  plans,
  today,
  onStartTrial,
  onTryDemo,
}: {
  title: string;
  body: string;
  profile?: CashProfile | null;
  plans?: Plan[];
  today: ISODate;
  onStartTrial: () => void;
  onTryDemo: () => void;
}) {
  const teaser = useMemo(() => {
    if (!profile || !plans) return null;
    const days = simulate(profile, plans, today);
    const short = days.filter((d) => d.status === "short").length;
    const tight = days.filter((d) => d.status === "tight").length;
    const first = nextDangerDay(days, profile.buffer);
    return { short, tight, inDays: first ? daysBetween(today, first.date) : null };
  }, [profile, plans, today]);

  return (
    <Card className="flex flex-col items-center gap-3 py-10 text-center">
      <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-2xl">
        🔒
      </span>
      {teaser && (teaser.short > 0 || teaser.tight > 0) ? (
        <p className="max-w-lg text-lg font-semibold text-slate-900">
          We found {teaser.short > 0 ? `${teaser.short} short day${teaser.short === 1 ? "" : "s"}` : `${teaser.tight} tight day${teaser.tight === 1 ? "" : "s"}`} in your next 90 days
          {teaser.inDays !== null && (teaser.inDays === 0 ? ", starting today." : `, the first one in ${teaser.inDays} day${teaser.inDays === 1 ? "" : "s"}.`)}
        </p>
      ) : teaser ? (
        <p className="max-w-lg text-lg font-semibold text-slate-900">Good news: no danger days in your next 90 days so far.</p>
      ) : null}
      <h2 className="text-base font-semibold text-slate-800">{title}</h2>
      <p className="max-w-lg text-sm text-slate-600">{body}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button size="lg" onClick={onStartTrial}>
          Start {TRIAL_DAYS}-day free trial
        </Button>
        <Button size="lg" variant="secondary" onClick={onTryDemo}>
          Explore the demo first
        </Button>
      </div>
      <p className="text-xs text-slate-500">Then {PRICES.monthly.label} or {PRICES.annual.label}. Cancel anytime. Rescue mode is always free.</p>
    </Card>
  );
}
