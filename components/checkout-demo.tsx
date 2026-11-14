"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { checkAffordability, PROVIDERS, roundMoney } from "@/lib/engine";
import type { ProviderId, PurchaseInput } from "@/lib/engine";
import { samplePlans, sampleProfile } from "@/lib/sample-data";
import { localToday, formatMoney } from "@/lib/ui-format";
import { hasPlusAccess, useAppState } from "@/lib/use-app-state";
import { verdictCopy } from "@/lib/verdict-copy";
import { cx } from "./ui";

const PRODUCTS = [
  { id: "jacket", name: "Trail shell jacket", price: 240, emoji: "🧥" },
  { id: "boots", name: "Waterproof hiking boots", price: 160, emoji: "🥾" },
  { id: "tent", name: "2-person ultralight tent", price: 520, emoji: "⛺" },
  { id: "socks", name: "Merino socks, 3-pack", price: 36, emoji: "🧦" },
];

const BNPL_PROVIDERS: ProviderId[] = ["klarna", "afterpay", "affirm", "paypal"];

type Method = "card" | "payin4" | "monthly";

const TONE = {
  safe: { box: "bg-emerald-50 ring-emerald-300", title: "text-emerald-800", icon: "✓" },
  tight: { box: "bg-amber-50 ring-amber-300", title: "text-amber-900", icon: "!" },
  no: { box: "bg-red-50 ring-red-300", title: "text-red-800", icon: "✕" },
} as const;

/**
 * A fictional store checkout showing what the SplitSafe browser extension adds: a verdict next to
 * the Pay-in-4 option, computed by the same engine as the dashboard, before the user clicks buy.
 */
export function CheckoutDemo() {
  const { state, ready } = useAppState();
  const [today, setToday] = useState<string | null>(null);
  const [productId, setProductId] = useState("jacket");
  const [method, setMethod] = useState<Method>("payin4");
  const [provider, setProvider] = useState<ProviderId>("klarna");
  const [months, setMonths] = useState(6);
  const [placed, setPlaced] = useState(false);

  useEffect(() => setToday(localToday()), []);

  const product = PRODUCTS.find((p) => p.id === productId)!;
  // Own numbers are a Plus feature; everyone else sees the check on the sample persona.
  const usingSample = !state.profile || !hasPlusAccess(state);
  const data = useMemo(() => {
    if (!today) return null;
    return !usingSample && state.profile ? { profile: state.profile, plans: state.plans } : { profile: sampleProfile(today), plans: samplePlans(today) };
  }, [state, today, usingSample]);

  const input: PurchaseInput | null =
    method === "card" ? null : { amount: product.price, provider, term: method === "payin4" ? { kind: "payin4" } : { kind: "monthly", months, apr: 0 } };
  const copy = useMemo(() => {
    if (!input || !data || !today) return null;
    return verdictCopy(input, checkAffordability(data.profile, data.plans, input, today), today, data.profile.buffer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- input is derived from these
  }, [data, today, product.price, provider, method, months]);

  if (!ready || !today) return null;

  return (
    <div className="min-h-screen bg-stone-100">
      <div className="bg-slate-900 px-4 py-2 text-center text-xs text-slate-100">
        Demo store for illustration — nothing here is a real purchase. <Link href="/app" className="underline">Back to SplitSafe</Link>
      </div>

      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <span className="text-lg font-bold tracking-tight text-stone-900">🌲 Pinecrest Supply</span>
          <span className="text-sm text-stone-500">Secure checkout</span>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-[1fr_24rem]">
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200">
          <h1 className="text-xl font-semibold text-stone-900">Checkout</h1>

          <h2 className="mt-6 text-sm font-semibold text-stone-700">Your item</h2>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PRODUCTS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setProductId(p.id);
                  setPlaced(false);
                }}
                className={cx(
                  "rounded-xl p-3 text-left ring-1 transition",
                  p.id === productId ? "bg-stone-900 text-white ring-stone-900" : "bg-white text-stone-800 ring-stone-200 hover:ring-stone-400",
                )}
                aria-pressed={p.id === productId}
              >
                <span className="text-2xl" aria-hidden>
                  {p.emoji}
                </span>
                <span className="mt-1 block text-sm font-medium">{p.name}</span>
                <span className="text-sm opacity-80">{formatMoney(p.price)}</span>
              </button>
            ))}
          </div>

          <h2 className="mt-8 text-sm font-semibold text-stone-700">Payment method</h2>
          <fieldset className="mt-2 flex flex-col gap-2">
            <legend className="sr-only">Payment method</legend>
            <MethodOption checked={method === "card"} onChange={() => setMethod("card")} title="Debit or credit card" subtitle={`Pay ${formatMoney(product.price)} today`} />
            <MethodOption
              checked={method === "payin4"}
              onChange={() => setMethod("payin4")}
              title="Pay in 4"
              subtitle={`4 interest-free payments of ${formatMoney(roundMoney(product.price / 4))} with ${PROVIDERS[provider].name}`}
            />
            <MethodOption
              checked={method === "monthly"}
              onChange={() => setMethod("monthly")}
              title="Monthly payments"
              subtitle={`${months} monthly payments of ${formatMoney(roundMoney(product.price / months))} with ${PROVIDERS[provider].name} (0% APR shown)`}
            />
          </fieldset>

          {method !== "card" && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-stone-600">Provider:</span>
              {BNPL_PROVIDERS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProvider(p)}
                  aria-pressed={provider === p}
                  className={cx("rounded-full px-3 py-1 ring-1", provider === p ? "bg-stone-900 text-white ring-stone-900" : "bg-white ring-stone-300")}
                >
                  {PROVIDERS[p].name}
                </button>
              ))}
              {method === "monthly" && (
                <select
                  aria-label="Number of months"
                  value={months}
                  onChange={(e) => setMonths(Number(e.target.value))}
                  className="rounded-full bg-white px-3 py-1 ring-1 ring-stone-300"
                >
                  {[3, 6, 12].map((m) => (
                    <option key={m} value={m}>
                      {m} months
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {copy && (
            <div className={cx("mt-5 rounded-xl p-4 ring-2", TONE[copy.tone].box)} role="status" aria-live="polite">
              <div className="flex items-start gap-3">
                <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold">
                  {TONE[copy.tone].icon}
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">SplitSafe check</p>
                  <p className={cx("font-semibold", TONE[copy.tone].title)}>{copy.title}</p>
                  <p className="text-sm text-slate-800">{copy.detail}</p>
                  {copy.suggestion && <p className="mt-1 text-sm text-slate-700">💡 {copy.suggestion}</p>}
                  <p className="mt-2 text-xs text-slate-500">
                    {usingSample ? "Checked against Sarah's sample data. " : "Checked against your plans and paycheck. "}
                    Computed in your browser — nothing was sent anywhere.
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="h-fit rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200">
          <h2 className="text-sm font-semibold text-stone-700">Order summary</h2>
          <div className="mt-3 flex justify-between text-sm text-stone-700">
            <span>{product.name}</span>
            <span>{formatMoney(product.price)}</span>
          </div>
          <div className="mt-1 flex justify-between text-sm text-stone-500">
            <span>Shipping</span>
            <span>Free</span>
          </div>
          <div className="mt-3 flex justify-between border-t border-stone-200 pt-3 font-semibold text-stone-900">
            <span>Total</span>
            <span>{formatMoney(product.price)}</span>
          </div>
          <button
            type="button"
            onClick={() => setPlaced(true)}
            className="mt-5 w-full rounded-xl bg-stone-900 px-4 py-3 font-semibold text-white hover:bg-stone-800"
          >
            Place order
          </button>
          {placed && <p className="mt-3 text-sm text-stone-600">This is a demo store — no order was placed and nothing was charged.</p>}
          <div className="mt-6 rounded-xl bg-stone-50 p-3 text-xs text-stone-600">
            The green/amber/red box is what the <strong>SplitSafe browser extension</strong> adds to real checkout pages.{" "}
            <a href="/splitsafe-extension.zip" className="underline">
              Download the Chrome extension
            </a>
          </div>
        </aside>
      </main>
    </div>
  );
}

function MethodOption({ checked, onChange, title, subtitle }: { checked: boolean; onChange: () => void; title: string; subtitle: string }) {
  return (
    <label className={cx("flex cursor-pointer items-start gap-3 rounded-xl p-3 ring-1", checked ? "bg-stone-50 ring-stone-900" : "ring-stone-200")}>
      <input type="radio" name="method" checked={checked} onChange={onChange} className="mt-1 h-4 w-4 accent-stone-900" />
      <span>
        <span className="block text-sm font-medium text-stone-900">{title}</span>
        <span className="block text-sm text-stone-600">{subtitle}</span>
      </span>
    </label>
  );
}
