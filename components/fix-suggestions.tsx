"use client";

import { useMemo, useState } from "react";
import { moveRequestMessage, PROVIDERS, suggestFixes } from "@/lib/engine";
import type { CashProfile, Fix, FixAction, ISODate, Plan } from "@/lib/engine";
import { formatDate, formatMoney } from "@/lib/ui-format";
import { Badge, Button, Card } from "./ui";

type MoveAction = Extract<FixAction, { kind: "move" }>;

/** Turns the next danger day into concrete, checked options: move a payment, pause a bill, or a mix. */
export function FixSuggestions({
  profile,
  plans,
  today,
  onMovePayment,
}: {
  profile: CashProfile;
  plans: Plan[];
  today: ISODate;
  onMovePayment: (action: MoveAction) => void;
}) {
  const report = useMemo(() => suggestFixes(profile, plans, today), [profile, plans, today]);
  if (!report) return null;
  const { danger, moveTo, fixes, cashNeeded } = report;
  const isShort = danger.status === "short";

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">
          How to fix {formatDate(danger.date, today)}
        </h2>
        <span className="text-xs text-slate-500">Each option is re-checked against your full 90-day calendar</span>
      </div>

      {fixes.length > 0 ? (
        <ol className="mt-4 flex flex-col gap-3">
          {fixes.map((fix, i) => (
            <FixRow key={i} index={i} fix={fix} plans={plans} today={today} isShort={isShort} buffer={profile.buffer} onMovePayment={onMovePayment} />
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-slate-700">
          This one comes from essentials, so moving BNPL payments won&apos;t cover it. The <strong>Rescue</strong> tab shows what to protect first.
        </p>
      )}

      <p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">
        Or bring in <strong>{formatMoney(cashNeeded)}</strong> before {formatDate(danger.date, today)} (for example from savings or an extra shift)
        {isShort ? " to stay above $0" : " to stay above your buffer"} until payday on {formatDate(moveTo, today)}.
      </p>
    </Card>
  );
}

function FixRow({
  index,
  fix,
  plans,
  today,
  isShort,
  buffer,
  onMovePayment,
}: {
  index: number;
  fix: Fix;
  plans: Plan[];
  today: ISODate;
  isShort: boolean;
  buffer: number;
  onMovePayment: (action: MoveAction) => void;
}) {
  return (
    <li className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">
          Option {index + 1}
          {fix.actions.length > 1 && <span className="font-normal text-slate-500"> · {fix.actions.length} small changes</span>}
        </p>
        <Badge tone="green">
          {isShort ? "No short days before payday" : `Stays above your ${formatMoney(buffer)} buffer`} · low point {formatMoney(fix.lowestBalance)}
        </Badge>
      </div>
      <ul className="mt-3 flex flex-col gap-3">
        {fix.actions.map((a, j) =>
          a.kind === "move" ? (
            <MoveRow key={j} action={a} plan={plans.find((p) => p.id === a.planId)} today={today} onMovePayment={onMovePayment} />
          ) : (
            <li key={j} className="text-sm text-slate-800">
              ⏸️ Pause <strong>{a.label}</strong> ({formatMoney(a.amount)} on {formatDate(a.date, today)}) this month: it&apos;s marked non-essential.
            </li>
          ),
        )}
      </ul>
    </li>
  );
}

function MoveRow({ action, plan, today, onMovePayment }: { action: MoveAction; plan?: Plan; today: ISODate; onMovePayment: (a: MoveAction) => void }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const message = plan ? moveRequestMessage(plan, action) : null;
  const name = PROVIDERS[action.provider].name;

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
    <li className="text-sm text-slate-800">
      <p>
        📅 Ask <strong>{name}</strong> to move <strong>{formatMoney(action.amount)}</strong> ({action.label.split(" · ")[1] ?? "payment"}) from{" "}
        {formatDate(action.from, today)} to <strong>{formatDate(action.to, today)}</strong>, your payday.
      </p>
      <p className="mt-0.5 text-xs text-slate-500">{PROVIDERS[action.provider].hardshipOptions[0]}.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {message && (
          <>
            <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              {open ? "Hide request" : "Write the request"}
            </Button>
            <Button size="sm" variant="ghost" onClick={copy}>
              {copied ? "Copied ✓" : "Copy request"}
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" onClick={() => onMovePayment(action)}>
          {name} agreed: update my plan
        </Button>
      </div>
      {open && message && <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-sm text-slate-800">{message}</pre>}
    </li>
  );
}
