"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { debtSummary, nextDangerDay, nextPaycheckInsight, simulate } from "@/lib/engine";
import type { CashEvent, CashProfile, DayResult, FixAction, ISODate, Plan } from "@/lib/engine";
import { FixSuggestions } from "./fix-suggestions";
import { formatDate, formatMoney, formatMoneyShort, weekday } from "@/lib/ui-format";
import { buildIcs } from "@/lib/ics";
import { Badge, Button, Card, cx } from "./ui";

export function CalendarTab({
  profile,
  plans,
  today,
  onMovePayment,
}: {
  profile: CashProfile;
  plans: Plan[];
  today: ISODate;
  onMovePayment: (action: Extract<FixAction, { kind: "move" }>) => void;
}) {
  const days = useMemo(() => simulate(profile, plans, today), [profile, plans, today]);
  return (
    <div className="flex flex-col gap-6">
      <HeadlineCards days={days} profile={profile} plans={plans} today={today} />
      <FixSuggestions profile={profile} plans={plans} today={today} onMovePayment={onMovePayment} />
      <BalanceChart days={days} buffer={profile.buffer} today={today} />
      <DayList days={days} today={today} onExport={() => downloadIcs(plans, days, profile.buffer)} />
    </div>
  );
}

function eventSummary(events: CashEvent[]): string {
  return events.map((e) => `${e.kind === "installment" ? e.label.split(" · ")[0] : e.label} ${formatMoneyShort(e.amount)}`).join(" + ");
}

export function HeadlineCards({ days, profile, plans, today }: { days: DayResult[]; profile: CashProfile; plans: Plan[]; today: ISODate }) {
  const paycheck = nextPaycheckInsight(days, profile);
  const danger = nextDangerDay(days, profile.buffer);
  const debt = debtSummary(plans);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Card>
        <p className="text-sm font-medium text-slate-600">Already promised from your next paycheck</p>
        {paycheck ? (
          <>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{formatMoney(paycheck.promised)}</p>
            <p className="mt-1 text-sm text-slate-600">
              of {formatMoneyShort(paycheck.amount)} on {formatDate(paycheck.date, today)}
              {paycheck.amount > 0 && ` · ${Math.round((paycheck.promised / paycheck.amount) * 100)}%`}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              BNPL {formatMoney(paycheck.promisedBnpl)} · bills {formatMoney(paycheck.promisedBills)} before the following payday
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-slate-600">No payday in the next 90 days.</p>
        )}
      </Card>

      <Card className={cx(danger?.status === "short" && "ring-2 ring-red-300", danger?.status === "tight" && "ring-2 ring-amber-300")}>
        <p className="text-sm font-medium text-slate-600">Next danger day</p>
        {danger ? (
          <>
            <p className={cx("mt-2 text-3xl font-semibold tracking-tight", danger.status === "short" ? "text-red-700" : "text-amber-800")}>
              {formatDate(danger.date, today)}
            </p>
            <p className="mt-1 text-sm text-slate-700">
              {danger.status === "short" ? `Short by ${formatMoney(danger.gap)}` : `${formatMoney(danger.gap)} under your buffer`}
            </p>
            {danger.contributors.length > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                {eventSummary(danger.contributors)}
                {danger.beforePayday ? " before payday" : " since your last payday"}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-emerald-700">None</p>
            <p className="mt-1 text-sm text-slate-600">You stay above your {formatMoneyShort(profile.buffer)} buffer for 90 days.</p>
          </>
        )}
      </Card>

      <Card>
        <p className="text-sm font-medium text-slate-600">Debt-free on</p>
        {debt.debtFreeDate ? (
          <>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{formatDate(debt.debtFreeDate, today)}</p>
            <p className="mt-1 text-sm text-slate-600">
              {formatMoney(debt.totalOutstanding)} left across {debt.activePlans} plan{debt.activePlans === 1 ? "" : "s"}
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-slate-600">No unpaid BNPL installments.</p>
        )}
      </Card>
    </div>
  );
}

const STATUS_COLOR = { short: "#b91c1c", tight: "#b45309", ok: "#0f766e" } as const;

function BalanceChart({ days, buffer, today }: { days: DayResult[]; buffer: number; today: ISODate }) {
  const data = days.map((d) => ({ date: d.date, balance: d.endBalance, status: d.status }));
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Projected checking balance · next 90 days</h2>
        <div className="flex gap-3 text-xs text-slate-600">
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-red-700" /> $0
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-amber-700" /> Buffer {formatMoneyShort(buffer)}
          </span>
        </div>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0f766e" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#0f766e" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => formatDate(d, today)}
              tick={{ fontSize: 12, fill: "#64748b" }}
              tickLine={false}
              axisLine={{ stroke: "#cbd5e1" }}
              minTickGap={32}
            />
            <YAxis
              tickFormatter={(v: number) => formatMoneyShort(Math.round(v))}
              tick={{ fontSize: 12, fill: "#64748b" }}
              tickLine={false}
              axisLine={false}
              width={64}
            />
            <ReferenceLine y={0} stroke="#b91c1c" strokeWidth={1.5} />
            <ReferenceLine y={buffer} stroke="#b45309" strokeDasharray="4 4" />
            <Tooltip
              cursor={{ stroke: "#94a3b8" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as (typeof data)[number];
                return (
                  <div className="rounded-lg bg-white px-3 py-2 text-sm shadow-md ring-1 ring-slate-200">
                    <p className="font-medium text-slate-900">
                      {weekday(p.date)} {formatDate(p.date, today)}
                    </p>
                    <p className="text-slate-700">{formatMoney(p.balance)}</p>
                    {p.status !== "ok" && <p style={{ color: STATUS_COLOR[p.status] }}>{p.status === "short" ? "Short" : "Tight"}</p>}
                  </div>
                );
              }}
            />
            <Area
              type="stepAfter"
              dataKey="balance"
              stroke="#0f766e"
              strokeWidth={2}
              fill="url(#balanceFill)"
              isAnimationActive={false}
              dot={(props: { cx?: number; cy?: number; index?: number; payload?: (typeof data)[number] }) => {
                const { cx: x, cy: y, payload, index } = props;
                if (!payload || payload.status === "ok" || x == null || y == null) return <g key={index} />;
                return <circle key={index} cx={x} cy={y} r={4} fill={STATUS_COLOR[payload.status]} stroke="#fff" strokeWidth={2} />;
              }}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function downloadIcs(plans: Plan[], days: DayResult[], buffer: number) {
  const blob = new Blob([buildIcs(plans, days, buffer, new Date())], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "splitsafe-payments.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DayList({ days, today, onExport }: { days: DayResult[]; today: ISODate; onExport: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? days : days.filter((d) => d.events.length > 0 || d.date === today);
  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-900">Day by day</h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 accent-teal-700" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            Show quiet days
          </label>
          <Button size="sm" variant="secondary" onClick={onExport} title="Every BNPL payment plus danger-day warnings, for Google, Apple or Outlook Calendar">
            📅 Add to my calendar (.ics)
          </Button>
        </div>
      </div>
      <ul className="divide-y divide-slate-100">
        {visible.map((d) => (
          <li
            key={d.date}
            className={cx(
              "grid grid-cols-[4.5rem_1fr_auto] items-start gap-3 px-5 py-3",
              d.status === "short" && "bg-red-50",
              d.status === "tight" && "bg-amber-50",
            )}
          >
            <div>
              <p className="text-sm font-semibold text-slate-900">{formatDate(d.date, today)}</p>
              <p className="text-xs text-slate-500">{d.date === today ? "Today" : weekday(d.date)}</p>
            </div>
            <ul className="flex flex-col gap-0.5 text-sm">
              {d.events.length === 0 && <li className="text-slate-400">No scheduled money in or out</li>}
              {d.events.map((e, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="text-slate-700">
                    {e.label}
                    {e.kind === "installment" && e.overdue && (
                      <span className="ml-1.5">
                        <Badge tone="amber">overdue</Badge>
                      </span>
                    )}
                  </span>
                  <span className={cx("tabular-nums", e.kind === "income" ? "text-emerald-700" : "text-slate-900")}>
                    {e.kind === "income" ? "+" : "−"}
                    {formatMoney(e.amount)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex flex-col items-end gap-1">
              <span className={cx("text-sm font-semibold tabular-nums", d.endBalance < 0 ? "text-red-700" : "text-slate-900")}>
                {formatMoney(d.endBalance)}
              </span>
              {d.status === "short" && <Badge tone="red">Short</Badge>}
              {d.status === "tight" && <Badge tone="amber">Tight</Badge>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
