"use client";

import { useState } from "react";
import { checkAffordability, DEFAULT_ALTERNATIVE_APR, PROVIDERS, PROVIDER_IDS, SAFE_DATE_SEARCH_DAYS } from "@/lib/engine";
import type { AffordabilityReport, CashProfile, ISODate, Plan, ProviderId, PurchaseInput, PurchaseTerm } from "@/lib/engine";
import { formatDate, formatMoney } from "@/lib/ui-format";
import { Button, Card, cx, Field, Input, Select } from "./ui";

const termLabel = (t: PurchaseTerm) => (t.kind === "payin4" ? "Pay in 4 (every 2 weeks)" : `${t.months} monthly payments at ${t.apr}% APR`);

const VERDICT_STYLE = {
  SAFE: { box: "bg-emerald-50 ring-emerald-200", title: "text-emerald-800", label: "Safe", icon: "✓" },
  TIGHT: { box: "bg-amber-50 ring-amber-200", title: "text-amber-900", label: "Tight", icon: "!" },
  NO: { box: "bg-red-50 ring-red-200", title: "text-red-800", label: "Not right now", icon: "✕" },
} as const;

export function AffordTab({
  profile,
  plans,
  today,
  checksLeft,
  onCheck,
  onNeedPlus,
}: {
  profile: CashProfile;
  plans: Plan[];
  today: ISODate;
  checksLeft: number;
  onCheck: () => void;
  onNeedPlus: () => void;
}) {
  const [amount, setAmount] = useState("240");
  const [provider, setProvider] = useState<ProviderId>("klarna");
  const [kind, setKind] = useState<"payin4" | "monthly">("payin4");
  const [months, setMonths] = useState("6");
  const [apr, setApr] = useState("0");
  const [result, setResult] = useState<{ input: PurchaseInput; report: AffordabilityReport } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = () => {
    const amt = Number(amount);
    if (!amount.trim() || !(amt > 0)) return setError("Enter the purchase amount.");
    const m = Number(months);
    const a = Number(apr);
    if (kind === "monthly" && (!Number.isInteger(m) || m < 1 || m > 60)) return setError("Months must be between 1 and 60.");
    if (kind === "monthly" && (Number.isNaN(a) || a < 0 || a > 100)) return setError("APR must be between 0 and 100.");
    setError(null);
    if (checksLeft <= 0) return onNeedPlus();
    onCheck();
    const input: PurchaseInput = { amount: amt, provider, term: kind === "payin4" ? { kind: "payin4" } : { kind: "monthly", months: m, apr: a } };
    setResult({ input, report: checkAffordability(profile, plans, input, today) });
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[22rem_1fr]">
      <Card>
        <h2 className="text-base font-semibold text-slate-900">Can I afford this?</h2>
        <p className="mt-1 text-sm text-slate-600">We replay your next months with the new plan added, before you click buy.</p>
        <form
          className="mt-5 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            check();
          }}
        >
          <Field label="Purchase amount ($)">
            {(id) => <Input id={id} type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />}
          </Field>
          <Field label="Provider">
            {(id) => (
              <Select id={id} value={provider} onChange={(e) => setProvider(e.target.value as ProviderId)}>
                {PROVIDER_IDS.map((p) => (
                  <option key={p} value={p}>
                    {PROVIDERS[p].name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Payment plan">
            {(id) => (
              <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as "payin4" | "monthly")}>
                <option value="payin4">Pay in 4 — first payment today, then every 2 weeks</option>
                <option value="monthly">Monthly installments</option>
              </Select>
            )}
          </Field>
          {kind === "monthly" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Months">{(id) => <Input id={id} type="number" min={1} max={60} value={months} onChange={(e) => setMonths(e.target.value)} />}</Field>
              <Field label="APR %">{(id) => <Input id={id} type="number" min={0} max={100} step="0.01" value={apr} onChange={(e) => setApr(e.target.value)} />}</Field>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-amber-800">
              {error}
            </p>
          )}
          <Button type="submit" size="lg">
            Check it
          </Button>
          <p className="text-center text-xs text-slate-500">
            {Number.isFinite(checksLeft)
              ? `${checksLeft} of 3 free checks left this month`
              : "Plus: unlimited checks"}
          </p>
        </form>
      </Card>

      <div aria-live="polite">
        {result ? (
          <Verdict input={result.input} report={result.report} today={today} buffer={profile.buffer} />
        ) : (
          <div className="flex h-full min-h-48 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            Enter a purchase and press <span className="mx-1 font-medium text-slate-700">Check it</span> to see SAFE, TIGHT or NO — with the exact day it would bite.
          </div>
        )}
      </div>
    </div>
  );
}

function Verdict({ input, report, today, buffer }: { input: PurchaseInput; report: AffordabilityReport; today: ISODate; buffer: number }) {
  const style = VERDICT_STYLE[report.verdict];
  const name = PROVIDERS[input.provider].name;
  return (
    <div className="flex flex-col gap-4">
      <div className={cx("rounded-2xl p-6 ring-1", style.box)}>
        <p className={cx("flex items-center gap-2 text-2xl font-semibold", style.title)}>
          <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg">
            {style.icon}
          </span>
          {report.verdict} · {style.label}
        </p>
        <p className="mt-2 text-slate-800">
          {formatMoney(input.amount)} with {name}, {termLabel(input.term).toLowerCase()}
          {input.term.kind === "monthly" && ` — ${formatMoney(report.totalCost)} total`}.
        </p>
        {report.firstProblem && report.verdict === "NO" && (
          <p className="mt-2 text-slate-800">
            On <strong>{formatDate(report.firstProblem.date, today)}</strong> you&apos;d be <strong>{formatMoney(report.firstProblem.gap)} short</strong>.
          </p>
        )}
        {report.firstProblem && report.verdict === "TIGHT" && (
          <p className="mt-2 text-slate-800">
            On <strong>{formatDate(report.firstProblem.date, today)}</strong> you&apos;d drop to {formatMoney(report.firstProblem.endBalance)} —{" "}
            {formatMoney(report.firstProblem.gap)} under your {formatMoney(buffer)} buffer.
          </p>
        )}
        {report.verdict === "SAFE" && (
          <p className="mt-2 text-slate-800">
            {report.preexistingShortDays > 0
              ? `It doesn't push any day under your ${formatMoney(buffer)} buffer that wasn't already there.`
              : `You stay above your ${formatMoney(buffer)} buffer the whole way.`}
          </p>
        )}
        {report.preexistingShortDays > 0 && (
          <p className="mt-2 text-sm text-slate-600">
            Heads-up: your calendar already has {report.preexistingShortDays} short day{report.preexistingShortDays === 1 ? "" : "s"} without this purchase. We only judge what this purchase adds.
          </p>
        )}
      </div>

      {report.verdict !== "SAFE" && (
        <Card>
          <h3 className="text-sm font-semibold text-slate-900">What would work instead</h3>
          <ul className="mt-3 flex flex-col gap-3 text-sm">
            <li className="flex gap-3">
              <span aria-hidden>📅</span>
              <span>
                {report.earliestSafeDate ? (
                  <>
                    Wait until <strong>{formatDate(report.earliestSafeDate, today)}</strong> — buying then keeps every day above your buffer.
                  </>
                ) : (
                  <>No start date in the next {SAFE_DATE_SEARCH_DAYS} days keeps you above your buffer with this plan.</>
                )}
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden>🔁</span>
              <span>
                {report.saferTerm ? (
                  <>
                    <strong>{termLabel(report.saferTerm.term)}</strong> would be safe starting today
                    {report.saferTerm.term.kind === "monthly" && (
                      <>
                        {" "}
                        ({formatMoney(report.saferTerm.result.installments[0].amount)}/month, {formatMoney(report.saferTerm.result.totalCost)} total
                        {input.term.kind === "payin4" && `, assuming ${DEFAULT_ALTERNATIVE_APR}% APR — check the real offer`})
                      </>
                    )}
                    .
                  </>
                ) : (
                  <>None of the other common terms (Pay in 4, 3, 6 or 12 months) would be safe starting today.</>
                )}
              </span>
            </li>
          </ul>
        </Card>
      )}

      <Card>
        <h3 className="text-sm font-semibold text-slate-900">Payment schedule if you buy today</h3>
        <ul className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {report.installments.slice(0, 12).map((i) => (
            <li key={i.dueDate} className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">{formatDate(i.dueDate, today)}</p>
              <p className="font-medium tabular-nums text-slate-900">{formatMoney(i.amount)}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
