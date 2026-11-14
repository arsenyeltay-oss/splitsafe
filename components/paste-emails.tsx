"use client";

import { useState } from "react";
import type { ISODate, Plan } from "@/lib/engine";
import { draftProblems, draftToPlan, hasProblems, type PlanDraft } from "@/lib/plan-draft";
import { sampleEmails } from "@/lib/sample-data";
import { PlanEditor } from "./plan-editor";
import { Badge, Button, Card } from "./ui";

const MAX_CHARS = 20_000;

type Phase = { kind: "input" } | { kind: "loading" } | { kind: "review"; drafts: PlanDraft[] } | { kind: "error"; message: string };

/** Paste → LLM extraction (server) → user reviews and fixes every plan → save. */
export function PasteEmails({ today, onSave, onManual }: { today: ISODate; onSave: (plans: Plan[]) => void; onManual: () => void }) {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "input" });
  const [showProblems, setShowProblems] = useState(false);

  const parse = async () => {
    setPhase({ kind: "loading" });
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, today }),
      });
      const data = (await res.json().catch(() => ({}))) as { plans?: PlanDraft[]; error?: string };
      if (!res.ok || !data.plans) {
        setPhase({ kind: "error", message: data.error ?? "Something went wrong. You can add plans manually instead." });
        return;
      }
      if (data.plans.length === 0) {
        setPhase({ kind: "error", message: "We didn't find a BNPL plan in that text. Check you pasted the confirmation email, or add the plan manually." });
        return;
      }
      setShowProblems(true);
      setPhase({ kind: "review", drafts: data.plans });
    } catch {
      setPhase({ kind: "error", message: "We couldn't reach the parser. Check your connection, or add plans manually." });
    }
  };

  if (phase.kind === "review") {
    const { drafts } = phase;
    const plans = drafts.map(draftToPlan);
    const ready = plans.every(Boolean);
    const setDraft = (i: number, d: PlanDraft) => setPhase({ kind: "review", drafts: drafts.map((x, j) => (j === i ? d : x)) });

    return (
      <Card>
        <h2 className="text-base font-semibold text-slate-900">Review {drafts.length === 1 ? "this plan" : `these ${drafts.length} plans`}</h2>
        <p className="mt-1 text-sm text-slate-600">
          Check each one against your email. Anything we couldn&apos;t find is highlighted — we never guess dates or amounts.
        </p>
        <div className="mt-5 flex flex-col gap-6">
          {drafts.map((d, i) => {
            const incomplete = hasProblems(draftProblems(d));
            return (
              <section key={d.id} className="rounded-xl border border-slate-200 p-4" aria-label={`Plan ${i + 1}`}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">Plan {i + 1}</span>
                    {d.confidence && (
                      <Badge tone={d.confidence === "high" ? "green" : d.confidence === "medium" ? "amber" : "red"}>{d.confidence} confidence</Badge>
                    )}
                    {incomplete ? <Badge tone="amber">needs your input</Badge> : <Badge tone="green">ready</Badge>}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setPhase({ kind: "review", drafts: drafts.filter((_, j) => j !== i) })}>
                    Discard
                  </Button>
                </div>
                {d.missingFields.length > 0 && (
                  <p className="mb-3 text-sm text-amber-800">Not found in the email: {d.missingFields.join(", ")}.</p>
                )}
                <PlanEditor draft={d} onChange={(nd) => setDraft(i, nd)} showProblems={showProblems} />
              </section>
            );
          })}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button disabled={!ready || drafts.length === 0} onClick={() => onSave(plans as Plan[])}>
            Save {drafts.length} plan{drafts.length === 1 ? "" : "s"}
          </Button>
          <Button variant="ghost" onClick={() => setPhase({ kind: "input" })}>
            Back to text
          </Button>
          {!ready && <span className="text-sm text-amber-800">Fill in the highlighted fields first.</span>}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="text-base font-semibold text-slate-900">Paste your confirmation emails</h2>
      <p className="mt-1 text-sm text-slate-600">
        Paste one or more emails. The text is sent once to our parser to pull out the plan details, then discarded — it isn&apos;t stored.
      </p>
      <textarea
        aria-label="Confirmation email text"
        className="mt-4 h-56 w-full rounded-lg border border-slate-300 p-3 font-mono text-xs text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
        placeholder={"From: Klarna\nYour purchase from Nike for $160.00 is split into 4 payments of $40.00…"}
        value={text}
        maxLength={MAX_CHARS}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-1 flex justify-between text-xs text-slate-500">
        <button type="button" className="font-medium text-teal-800 underline underline-offset-2" onClick={() => setText(sampleEmails(today))}>
          Paste 3 sample emails
        </button>
        <span>
          {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
        </span>
      </div>

      {phase.kind === "error" && (
        <div role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          {phase.message}{" "}
          <button type="button" className="font-medium underline underline-offset-2" onClick={onManual}>
            Add manually
          </button>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Button onClick={parse} disabled={phase.kind === "loading" || text.trim().length === 0}>
          {phase.kind === "loading" ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
              Reading your emails…
            </>
          ) : (
            "Extract plans"
          )}
        </Button>
        <Button variant="ghost" onClick={onManual}>
          Add manually instead
        </Button>
      </div>
    </Card>
  );
}
