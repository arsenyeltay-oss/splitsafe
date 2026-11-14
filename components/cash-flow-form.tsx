"use client";

import { useState } from "react";
import { addDays, isValidISODate } from "@/lib/engine";
import type { Bill, CashProfile, ISODate, PayFrequency } from "@/lib/engine";
import { newId } from "@/lib/ui-format";
import { Button, Card, Field, Input, Select } from "./ui";

export const defaultProfile = (today: ISODate): CashProfile => ({
  balance: 0,
  paycheckAmount: 0,
  frequency: "biweekly",
  nextPayday: addDays(today, 7),
  bills: [],
  buffer: 100,
});

const FREQUENCIES: { value: PayFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "semimonthly", label: "Twice a month" },
  { value: "monthly", label: "Monthly" },
];

type BillRow = { id: string; name: string; amount: string; dayOfMonth: string; essential: boolean };

export function CashFlowForm({ profile, today, onSave }: { profile: CashProfile | null; today: ISODate; onSave: (p: CashProfile) => void }) {
  const initial = profile ?? defaultProfile(today);
  const [balance, setBalance] = useState(profile ? String(initial.balance) : "");
  const [paycheck, setPaycheck] = useState(profile ? String(initial.paycheckAmount) : "");
  const [frequency, setFrequency] = useState<PayFrequency>(initial.frequency);
  const [nextPayday, setNextPayday] = useState(initial.nextPayday);
  const [buffer, setBuffer] = useState(String(initial.buffer));
  const [bills, setBills] = useState<BillRow[]>(
    initial.bills.map((b) => ({ id: b.id, name: b.name, amount: String(b.amount), dayOfMonth: String(b.dayOfMonth), essential: b.essential })),
  );
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState(false);

  const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
  const errors = {
    balance: Number.isNaN(num(balance)) ? "Enter your current checking balance" : null,
    paycheck: Number.isNaN(num(paycheck)) || num(paycheck) < 0 ? "Enter your take-home pay per paycheck" : null,
    nextPayday: !isValidISODate(nextPayday) ? "Pick your next payday" : nextPayday < today ? "Next payday can't be in the past" : null,
    buffer: Number.isNaN(num(buffer)) || num(buffer) < 0 ? "Enter a buffer (0 is fine)" : null,
  };
  const billErrors = bills.map((b) => {
    const day = Number(b.dayOfMonth);
    return !b.name.trim() || Number.isNaN(num(b.amount)) || num(b.amount) < 0 || !Number.isInteger(day) || day < 1 || day > 31;
  });
  const valid = !Object.values(errors).some(Boolean) && !billErrors.some(Boolean);

  const submit = () => {
    setTouched(true);
    if (!valid) return;
    const cleanBills: Bill[] = bills.map((b) => ({ id: b.id, name: b.name.trim(), amount: num(b.amount), dayOfMonth: Number(b.dayOfMonth), essential: b.essential }));
    onSave({ balance: num(balance), paycheckAmount: num(paycheck), frequency, nextPayday, buffer: num(buffer), bills: cleanBills });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const err = (k: keyof typeof errors) => (touched ? errors[k] : null);

  return (
    <Card>
      <h2 className="text-base font-semibold text-slate-900">Your cash flow</h2>
      <p className="mt-1 text-sm text-slate-600">We use this to project your checking balance. It never leaves this browser.</p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Checking balance today ($)" hint={err("balance") ?? undefined}>
          {(id) => <Input id={id} type="number" inputMode="decimal" step="0.01" value={balance} invalid={!!err("balance")} onChange={(e) => setBalance(e.target.value)} placeholder="e.g. 380" />}
        </Field>
        <Field label="Take-home pay per paycheck ($)" hint={err("paycheck") ?? undefined}>
          {(id) => <Input id={id} type="number" inputMode="decimal" min={0} step="0.01" value={paycheck} invalid={!!err("paycheck")} onChange={(e) => setPaycheck(e.target.value)} placeholder="e.g. 1450" />}
        </Field>
        <Field label="How often you're paid">
          {(id) => (
            <Select id={id} value={frequency} onChange={(e) => setFrequency(e.target.value as PayFrequency)}>
              {FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Next payday" hint={err("nextPayday") ?? (frequency === "semimonthly" ? "Twice a month: we use the 15th & last day, or this day and 15 days later." : undefined)}>
          {(id) => <Input id={id} type="date" min={today} value={nextPayday} invalid={!!err("nextPayday")} onChange={(e) => setNextPayday(e.target.value)} />}
        </Field>
        <Field label="Safety buffer ($)" hint={err("buffer") ?? "Days below this are marked tight."}>
          {(id) => <Input id={id} type="number" inputMode="decimal" min={0} step="1" value={buffer} invalid={!!err("buffer")} onChange={(e) => setBuffer(e.target.value)} />}
        </Field>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-slate-800">Recurring bills (optional)</h3>
        <p className="text-xs text-slate-500">Rent, phone, insurance, groceries — anything that leaves checking around the same day each month. Mark essentials so rescue mode protects them first.</p>
        <div className="mt-3 flex flex-col gap-2">
          {bills.map((b, idx) => (
            <div key={b.id} className="grid grid-cols-[1fr_6rem_4.5rem] items-center gap-2 sm:grid-cols-[1fr_7rem_5.5rem_auto_auto]">
              <Input aria-label="Bill name" placeholder="Rent" value={b.name} invalid={touched && billErrors[idx] && !b.name.trim()} onChange={(e) => setBills(bills.map((x) => (x.id === b.id ? { ...x, name: e.target.value } : x)))} />
              <Input aria-label="Bill amount" type="number" inputMode="decimal" min={0} placeholder="$" value={b.amount} invalid={touched && billErrors[idx] && Number.isNaN(num(b.amount))} onChange={(e) => setBills(bills.map((x) => (x.id === b.id ? { ...x, amount: e.target.value } : x)))} />
              <Input aria-label="Day of month" type="number" min={1} max={31} placeholder="Day" value={b.dayOfMonth} invalid={touched && billErrors[idx]} onChange={(e) => setBills(bills.map((x) => (x.id === b.id ? { ...x, dayOfMonth: e.target.value } : x)))} />
              <label className="col-span-2 flex items-center gap-1.5 text-sm text-slate-700 sm:col-span-1" title="Essentials are protected first in rescue mode">
                <input type="checkbox" className="h-4 w-4 accent-teal-700" checked={b.essential} onChange={(e) => setBills(bills.map((x) => (x.id === b.id ? { ...x, essential: e.target.checked } : x)))} />
                Essential
              </label>
              <Button variant="ghost" size="sm" aria-label={`Remove ${b.name || "bill"}`} onClick={() => setBills(bills.filter((x) => x.id !== b.id))}>
                ✕
              </Button>
            </div>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setBills([...bills, { id: newId(), name: "", amount: "", dayOfMonth: "1", essential: true }])}>
          + Add bill
        </Button>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <Button onClick={submit}>Save cash flow</Button>
        {saved && <span className="text-sm text-emerald-700" role="status">Saved ✓</span>}
        {touched && !valid && <span className="text-sm text-amber-800">Fill in the highlighted fields.</span>}
      </div>
    </Card>
  );
}
