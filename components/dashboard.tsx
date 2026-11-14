"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FixAction } from "@/lib/engine";
import { samplePlans, sampleProfile } from "@/lib/sample-data";
import { useAppState } from "@/lib/use-app-state";
import { localToday } from "@/lib/ui-format";
import { AffordTab } from "./afford-tab";
import { CalendarTab } from "./calendar-tab";
import { CashFlowForm } from "./cash-flow-form";
import { PlansTab } from "./plans-tab";
import { RescueTab } from "./rescue-tab";
import { Button, cx, Disclaimer, EmptyState } from "./ui";

const TABS = [
  { id: "calendar", label: "Calendar" },
  { id: "plans", label: "Plans" },
  { id: "cash", label: "Cash flow" },
  { id: "afford", label: "Can I afford this?" },
  { id: "rescue", label: "Rescue" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function Dashboard() {
  const store = useAppState();
  const { state, ready } = store;
  const [today, setToday] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("calendar");

  const loadSample = () => {
    const t = localToday();
    store.replaceAll({ version: 1, plans: samplePlans(t), profile: sampleProfile(t), isSample: true });
    setTab("calendar");
  };

  useEffect(() => setToday(localToday()), []);

  /** The provider agreed to a new date: update that one installment. */
  const movePayment = (a: Extract<FixAction, { kind: "move" }>) => {
    const plan = state.plans.find((p) => p.id === a.planId);
    if (!plan) return;
    let done = false;
    store.upsertPlan({
      ...plan,
      installments: plan.installments
        .map((i) => {
          if (done || i.status !== "upcoming" || i.dueDate !== a.from || i.amount !== a.amount) return i;
          done = true;
          return { ...i, dueDate: a.to };
        })
        .sort((x, y) => x.dueDate.localeCompare(y.dueDate)),
    });
  };

  // Landing page links here with ?sample=1 (load demo) or ?start=1 (go to plans).
  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams(window.location.search);
    if (params.has("sample")) loadSample();
    else if (params.has("start")) setTab("plans");
    if (params.size > 0) window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once after storage loads
  }, [ready]);

  if (!ready || !today) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" role="status">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-teal-700" aria-label="Loading" />
      </div>
    );
  }

  const isEmpty = state.plans.length === 0 && !state.profile;
  const needsProfile = (
    <EmptyState title="Add your cash flow first" body="We need your balance, paycheck and payday to project your days. It takes about a minute.">
      <Button onClick={() => setTab("cash")}>Set up cash flow</Button>
      <Button variant="secondary" onClick={loadSample}>
        Try with sample data
      </Button>
    </EmptyState>
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="text-lg font-semibold tracking-tight text-slate-900">
          Split<span className="text-teal-700">Safe</span>
        </Link>
        <div className="flex flex-wrap gap-2">
          <Link href="/demo/checkout" className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-teal-800 hover:bg-teal-50">
            See it at checkout →
          </Link>
          <Button variant="secondary" size="sm" onClick={loadSample}>
            {state.isSample ? "Reload sample" : "Try with sample data"}
          </Button>
          {!isEmpty && (
            <Button variant="ghost" size="sm" onClick={() => confirm("Clear all plans and cash flow from this browser?") && store.reset()}>
              Clear data
            </Button>
          )}
        </div>
      </header>

      {state.isSample && (
        <div className="rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-900 ring-1 ring-teal-200">
          <strong>Sample data:</strong> Sarah, 31 — paid $1,450 every two weeks, rent $1,200 a month, $380 in checking, three BNPL plans. Edit anything, or{" "}
          <button type="button" className="font-medium underline underline-offset-2" onClick={() => store.reset()}>
            start fresh with your own
          </button>
          .
        </div>
      )}

      {isEmpty ? (
        <EmptyState
          title="See every BNPL plan against your paycheck"
          body="Add your plans and your pay schedule, and we'll show the days your balance dips — before autopay finds them. Nothing is stored on a server."
        >
          <Button size="lg" onClick={loadSample}>
            Try it with sample data
          </Button>
          <Button size="lg" variant="secondary" onClick={() => setTab("plans")}>
            Add my plans
          </Button>
        </EmptyState>
      ) : null}

      <nav aria-label="Sections" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div role="tablist" className="flex min-w-max gap-1 rounded-xl bg-slate-200/60 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cx(
                "rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
                tab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <main role="tabpanel">
        {tab === "calendar" &&
          (state.profile ? <CalendarTab profile={state.profile} plans={state.plans} today={today} onMovePayment={movePayment} /> : needsProfile)}
        {tab === "plans" && (
          <PlansTab plans={state.plans} today={today} onSave={store.upsertPlan} onAdd={store.addPlans} onDelete={store.deletePlan} onLoadSample={loadSample} />
        )}
        {tab === "cash" && (
          <CashFlowForm
            key={state.isSample ? "sample" : "own"}
            profile={state.profile}
            today={today}
            onSave={(p) => {
              store.setProfile(p);
            }}
          />
        )}
        {tab === "afford" && (state.profile ? <AffordTab profile={state.profile} plans={state.plans} today={today} /> : needsProfile)}
        {tab === "rescue" &&
          (state.profile ? (
            state.plans.length > 0 ? (
              <RescueTab profile={state.profile} plans={state.plans} today={today} />
            ) : (
              <EmptyState title="No plans to rescue" body="Rescue mode helps when income drops and BNPL payments are at risk. Add a plan first." />
            )
          ) : (
            needsProfile
          ))}
      </main>

      <footer className="border-t border-slate-200 pt-4">
        <Disclaimer />
      </footer>
    </div>
  );
}
