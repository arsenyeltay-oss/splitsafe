"use client";

import { useRef, useState } from "react";
import { addDays, PROVIDERS } from "@/lib/engine";
import type { Bill, CashProfile, ISODate, PayFrequency, Plan } from "@/lib/engine";
import { analyzeStatement, isSameBnplPlan, type StatementAnalysis } from "@/lib/bank/analyze";
import { parseStatement } from "@/lib/bank/csv";
import { sampleStatementCsv } from "@/lib/bank/sample-statement";
import { draftToPlan, type PlanDraft } from "@/lib/plan-draft";
import { formatDate, formatMoney, newId } from "@/lib/ui-format";
import { PlanEditor } from "./plan-editor";
import { Badge, Button, Card, Field, Input, Select } from "./ui";

const MAX_BYTES = 5 * 1024 * 1024;

const FREQ_LABEL: Record<PayFrequency, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  semimonthly: "Twice a month",
  monthly: "Monthly",
};

interface BillRow extends Bill {
  include: boolean;
  note?: string;
}

/**
 * Bank statement import, entirely in the browser: the CSV is read with FileReader, parsed and
 * analyzed on this device, and nothing is uploaded. The user reviews everything before saving.
 */
export function BankImport({
  today,
  buffer,
  existingPlans,
  onApply,
  onCancel,
}: {
  today: ISODate;
  buffer: number;
  /** The user's current plans: ones found again in the statement aren't added twice. */
  existingPlans: Plan[];
  onApply: (profile: CashProfile, plans: Plan[]) => void;
  onCancel: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ analysis: StatementAnalysis; fileName: string } | null>(null);
  const [balance, setBalance] = useState("");
  const [paycheck, setPaycheck] = useState("");
  const [frequency, setFrequency] = useState<PayFrequency>("biweekly");
  const [nextPayday, setNextPayday] = useState(addDays(today, 7));
  const [bills, setBills] = useState<BillRow[]>([]);
  const [drafts, setDrafts] = useState<PlanDraft[]>([]);
  const [known, setKnown] = useState<PlanDraft[]>([]);
  const [showProblems, setShowProblems] = useState(false);

  const load = (text: string, fileName: string) => {
    try {
      const analysis = analyzeStatement(parseStatement(text).txns, today);
      setResult({ analysis, fileName });
      setError(null);
      setBalance(analysis.balance ? analysis.balance.amount.toFixed(2) : "");
      setPaycheck(analysis.paycheck ? analysis.paycheck.amount.toFixed(2) : "");
      if (analysis.paycheck) {
        setFrequency(analysis.paycheck.frequency);
        setNextPayday(analysis.paycheck.nextPayday);
      }
      // Everyday spending is spread over four weekly chunks so the projection doesn't show artificial cliffs.
      const quarter = Math.round(analysis.everydayPerMonth / 4);
      setBills([
        ...analysis.bills.map((b) => ({ ...b, id: newId(), include: true })),
        ...(quarter > 0
          ? [1, 8, 15, 22].map((day, i) => ({
              id: newId(),
              name: `Everyday spending (week ${i + 1})`,
              amount: quarter,
              dayOfMonth: day,
              essential: true,
              include: true,
              note: i === 0 ? "average from your statement" : undefined,
            }))
          : []),
      ]);
      setDrafts(analysis.plans.filter((d) => !existingPlans.some((p) => isSameBnplPlan(d, p))));
      setKnown(analysis.plans.filter((d) => existingPlans.some((p) => isSameBnplPlan(d, p))));
      setShowProblems(true);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "We couldn't read that file.");
    }
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) return setError("That file is larger than 5 MB. Export a shorter date range (60–90 days is ideal).");
    const reader = new FileReader();
    reader.onload = () => load(String(reader.result ?? ""), file.name);
    reader.onerror = () => setError("We couldn't open that file.");
    reader.readAsText(file);
  };

  const downloadSample = () => {
    const url = URL.createObjectURL(new Blob([sampleStatementCsv(today)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample-chase-statement.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!result) {
    return (
      <Card>
        <h2 className="text-base font-semibold text-slate-900">Import a bank statement</h2>
        <p className="mt-1 text-sm text-slate-600">
          Download a CSV of the last 60–90 days from your bank&apos;s website (Chase, Bank of America, Wells Fargo and most others offer
          “Download activity”). We find your balance, paycheck, recurring bills and BNPL payments.
        </p>
        <p className="mt-3 rounded-lg bg-teal-50 p-3 text-sm text-teal-900 ring-1 ring-teal-200">
          🔒 <strong>Private by design:</strong> the file is read in this browser and never uploaded. No bank login, no passwords, nothing stored on a server.
        </p>
        <div
          className="mt-4 flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 p-6 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onFile(e.dataTransfer.files[0]);
          }}
        >
          <p className="text-sm text-slate-600">Drop a .csv file here, or</p>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Bank statement CSV" onChange={(e) => onFile(e.target.files?.[0])} />
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => fileRef.current?.click()}>Choose CSV file</Button>
            <Button variant="secondary" onClick={() => load(sampleStatementCsv(today), "sample-chase-statement.csv")}>
              Use a sample statement
            </Button>
          </div>
          <button type="button" onClick={downloadSample} className="text-xs font-medium text-teal-800 underline underline-offset-2">
            Download the sample CSV to try the upload yourself
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-amber-900">
            {error}
          </p>
        )}
        <div className="mt-4">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </Card>
    );
  }

  const { analysis, fileName } = result;
  const planResults = drafts.map(draftToPlan);
  const plansReady = planResults.every(Boolean);
  const balanceN = Number(balance);
  const paycheckN = Number(paycheck);
  const cashReady = balance.trim() !== "" && Number.isFinite(balanceN) && paycheck.trim() !== "" && paycheckN >= 0 && nextPayday >= today;

  const apply = () => {
    if (!cashReady || !plansReady) return;
    onApply(
      {
        balance: balanceN,
        paycheckAmount: paycheckN,
        frequency,
        nextPayday,
        buffer,
        bills: bills.filter((b) => b.include).map(({ id, name, amount, dayOfMonth, essential }) => ({ id, name, amount, dayOfMonth, essential })),
      },
      planResults as Plan[],
    );
  };

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Here&apos;s what we found</h2>
        <span className="text-xs text-slate-500">
          {fileName} · {analysis.transactions} transactions, {formatDate(analysis.from, today)} – {formatDate(analysis.to, today)} · read on this device
        </span>
      </div>

      <section className="mt-5">
        <h3 className="text-sm font-semibold text-slate-800">Cash flow</h3>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Checking balance ($)" hint={analysis.balance ? `From your statement on ${formatDate(analysis.balance.asOf, today)}. Update it if it changed.` : "Not in the file. Enter today's balance."}>
            {(id) => <Input id={id} type="number" inputMode="decimal" step="0.01" value={balance} invalid={balance.trim() === ""} onChange={(e) => setBalance(e.target.value)} />}
          </Field>
          <Field label="Paycheck ($)" hint={analysis.paycheck ? `${analysis.paycheck.source}, seen ${analysis.paycheck.occurrences}×` : "No regular paycheck found. Enter it."}>
            {(id) => <Input id={id} type="number" inputMode="decimal" step="0.01" value={paycheck} invalid={paycheck.trim() === ""} onChange={(e) => setPaycheck(e.target.value)} />}
          </Field>
          <Field label="How often">
            {(id) => (
              <Select id={id} value={frequency} onChange={(e) => setFrequency(e.target.value as PayFrequency)}>
                {Object.entries(FREQ_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Next payday">{(id) => <Input id={id} type="date" min={today} value={nextPayday} invalid={nextPayday < today} onChange={(e) => setNextPayday(e.target.value)} />}</Field>
        </div>
      </section>

      <section className="mt-6">
        <h3 className="text-sm font-semibold text-slate-800">Recurring bills ({bills.filter((b) => b.include).length} included)</h3>
        {bills.length === 0 ? (
          <p className="mt-1 text-sm text-slate-600">No monthly bills found. You can add them on the Cash flow tab.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {bills.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="h-4 w-4 accent-teal-700" checked={b.include} onChange={(e) => setBills(bills.map((x) => (x.id === b.id ? { ...x, include: e.target.checked } : x)))} />
                  <span className="font-medium text-slate-800">{b.name}</span>
                  <span className="text-slate-600">
                    {formatMoney(b.amount)} on day {b.dayOfMonth}
                  </span>
                  {b.note && <span className="text-xs text-slate-500">({b.note})</span>}
                </label>
                <label className="flex items-center gap-1.5 text-slate-700">
                  <input type="checkbox" className="h-4 w-4 accent-teal-700" checked={b.essential} onChange={(e) => setBills(bills.map((x) => (x.id === b.id ? { ...x, essential: e.target.checked } : x)))} />
                  Essential
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <h3 className="text-sm font-semibold text-slate-800">
          New BNPL plans found in your payments ({drafts.length})
        </h3>
        {known.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 text-sm text-slate-600">
            {known.map((d) => (
              <li key={d.id} className="flex items-center gap-2">
                <Badge tone="neutral">already in your plans</Badge>
                {PROVIDERS[d.provider || "other"].name} · {d.merchant || "Purchase"} · {formatMoney(d.installments[0]?.amount ?? 0)} payments
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-slate-500">
          A statement only shows payments that already happened. A brand-new plan with no payment yet won&apos;t be here, so paste its confirmation email on the Plans tab.
        </p>
        <div className="mt-3 flex flex-col gap-4">
          {drafts.map((d, i) => (
            <div key={d.id} className="rounded-xl border border-slate-200 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800">Plan {i + 1}</span>
                  {planResults[i] ? <Badge tone="green">ready</Badge> : <Badge tone="amber">needs your input</Badge>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}>
                  Not a BNPL plan
                </Button>
              </div>
              {d.missingFields.length > 0 && <p className="mb-3 text-sm text-amber-800">Check: {d.missingFields.join("; ")}.</p>}
              <PlanEditor draft={d} onChange={(nd) => setDrafts(drafts.map((x, j) => (j === i ? nd : x)))} showProblems={showProblems} />
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={apply} disabled={!cashReady || !plansReady}>
          Use this
        </Button>
        <Button variant="ghost" onClick={() => setResult(null)}>
          Choose another file
        </Button>
        {(!cashReady || !plansReady) && <span className="text-sm text-amber-800">Fill in the highlighted fields first.</span>}
      </div>
    </Card>
  );
}
