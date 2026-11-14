"use client";

import { useEffect, useState } from "react";
import { PROVIDERS, sumMoney } from "@/lib/engine";
import type { CashProfile, ISODate, Plan } from "@/lib/engine";
import { draftProblems, draftToPlan, emptyDraft, hasProblems, planToDraft, type PlanDraft } from "@/lib/plan-draft";
import { formatDate, formatMoney } from "@/lib/ui-format";
import { PasteEmails } from "./paste-emails";
import { BankImport } from "./bank-import";
import { PayoffPlanner } from "./payoff-planner";
import { PlanEditor } from "./plan-editor";
import { Badge, Button, Card, EmptyState, Modal } from "./ui";

export function PlansTab({
  plans,
  profile,
  isPlus,
  onNeedPlus,
  today,
  onSave,
  onAdd,
  onDelete,
  onLoadSample,
  onImportBank,
  importRequest,
}: {
  plans: Plan[];
  profile: CashProfile | null;
  isPlus: boolean;
  onNeedPlus: () => void;
  today: ISODate;
  onSave: (p: Plan) => void;
  onAdd: (plans: Plan[]) => void;
  onDelete: (id: string) => void;
  onLoadSample: () => void;
  onImportBank: (profile: CashProfile, plans: Plan[]) => void;
  /** Bumped by the dashboard's "Import bank statement" shortcut to open the importer. */
  importRequest: number;
}) {
  const [editing, setEditing] = useState<PlanDraft | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const [mode, setMode] = useState<"none" | "paste" | "bank">(importRequest > 0 ? "bank" : "none");
  useEffect(() => {
    if (importRequest > 0) setMode("bank");
  }, [importRequest]);
  const pasting = mode !== "none";

  const startEdit = (d: PlanDraft) => {
    setShowProblems(false);
    setEditing(d);
  };
  const saveEdit = () => {
    if (!editing) return;
    const plan = draftToPlan(editing);
    if (!plan) return setShowProblems(true);
    onSave(plan);
    setEditing(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setMode(mode === "bank" ? "none" : "bank")} variant={mode === "bank" ? "secondary" : "primary"}>
          {mode === "bank" ? "Close bank import" : "🏦 Import bank statement"}
        </Button>
        <Button onClick={() => setMode(mode === "paste" ? "none" : "paste")} variant="secondary">
          {mode === "paste" ? "Close email paste" : "Paste confirmation emails"}
        </Button>
        <Button variant="secondary" onClick={() => startEdit(emptyDraft())}>
          Add a plan manually
        </Button>
      </div>

      {profile && plans.length > 0 && !pasting && (
        <PayoffPlanner profile={profile} plans={plans} today={today} isPlus={isPlus} onNeedPlus={onNeedPlus} />
      )}

      {mode === "bank" && (
        <BankImport
          today={today}
          buffer={profile?.buffer ?? 100}
          onApply={(p, imported) => {
            onImportBank(p, imported);
            setMode("none");
          }}
          onCancel={() => setMode("none")}
        />
      )}

      {mode === "paste" && (
        <PasteEmails
          today={today}
          onSave={(saved) => {
            onAdd(saved);
            setMode("none");
          }}
          onManual={() => {
            setMode("none");
            startEdit(emptyDraft());
          }}
        />
      )}

      {plans.length === 0 && !pasting ? (
        <EmptyState title="No plans yet" body="Import a bank statement (we find BNPL payments automatically, on your device), paste a confirmation email, or add a plan by hand.">
          <Button onClick={() => setMode("bank")}>Import bank statement</Button>
          <Button variant="secondary" onClick={() => setMode("paste")}>
            Paste emails
          </Button>
          <Button variant="secondary" onClick={onLoadSample}>
            Try with sample data
          </Button>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {plans.map((p) => (
            <PlanCard key={p.id} plan={p} today={today} onEdit={() => startEdit(planToDraft(p))} onDelete={() => onDelete(p.id)} />
          ))}
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing && plans.some((p) => p.id === editing.id) ? "Edit plan" : "Add a plan"}>
        {editing && (
          <div className="flex flex-col gap-5">
            <PlanEditor draft={editing} onChange={setEditing} showProblems={showProblems} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button onClick={saveEdit}>Save plan</Button>
            </div>
            {showProblems && hasProblems(draftProblems(editing)) && <p className="text-sm text-amber-800">Fill in the highlighted fields to save.</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}

function PlanCard({ plan, today, onEdit, onDelete }: { plan: Plan; today: ISODate; onEdit: () => void; onDelete: () => void }) {
  const rule = PROVIDERS[plan.provider];
  const upcoming = plan.installments.filter((i) => i.status === "upcoming");
  const paidCount = plan.installments.length - upcoming.length;
  const next = upcoming[0];
  const [confirming, setConfirming] = useState(false);

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="teal">{rule.name}</Badge>
            {plan.source === "parsed" && <Badge>from email</Badge>}
          </div>
          <h3 className="mt-2 text-lg font-semibold text-slate-900">{plan.merchant || "Purchase"}</h3>
          <p className="text-sm text-slate-600">
            {formatMoney(plan.totalAmount)}
            {plan.apr != null && plan.apr > 0 ? ` · ${plan.apr}% APR` : ""} · {paidCount} of {plan.installments.length} paid
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Left to pay</p>
          <p className="text-lg font-semibold tabular-nums text-slate-900">{formatMoney(sumMoney(upcoming.map((i) => i.amount)))}</p>
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        <div className="h-full rounded-full bg-teal-600" style={{ width: `${(paidCount / Math.max(1, plan.installments.length)) * 100}%` }} />
      </div>

      {next ? (
        <p className="mt-3 text-sm text-slate-700">
          Next: <span className="font-medium">{formatMoney(next.amount)}</span> on {formatDate(next.dueDate, today)}
          {next.dueDate < today && (
            <span className="ml-1.5">
              <Badge tone="amber">overdue</Badge>
            </span>
          )}
        </p>
      ) : (
        <p className="mt-3 text-sm text-emerald-700">Paid off 🎉</p>
      )}

      <p className="mt-2 text-xs text-slate-500">
        {rule.lateFee.description} {rule.reportsToCreditBureaus.description}
        {!rule.verified && " (unverified)"}
      </p>

      <div className="mt-4 flex gap-2">
        <Button variant="secondary" size="sm" onClick={onEdit}>
          Edit
        </Button>
        {confirming ? (
          <>
            <Button variant="danger" size="sm" onClick={onDelete}>
              Yes, delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        )}
      </div>
    </Card>
  );
}
