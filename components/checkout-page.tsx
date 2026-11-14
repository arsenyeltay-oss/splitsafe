"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { addDays } from "@/lib/engine";
import { checkTestCard, PLUS_FEATURES, PRICES, TRIAL_DAYS, type BillingInterval } from "@/lib/pricing";
import { useAppState } from "@/lib/use-app-state";
import { formatDate, formatMoney, localToday } from "@/lib/ui-format";
import { Button, Card, cx, Field, Input } from "./ui";

const TEST_CARD = { number: "4242 4242 4242 4242", expiry: "12 / 30", cvc: "123", zip: "10001" };

/**
 * Test-mode checkout for SplitSafe Plus. It validates the card like a real form (Luhn, expiry,
 * CVC, a decline card) but nothing is charged and no card data leaves the browser.
 */
export function CheckoutPage() {
  const store = useAppState();
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [zip, setZip] = useState("");
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [status, setStatus] = useState<"form" | "processing" | "done">("form");

  useEffect(() => {
    const plan = new URLSearchParams(window.location.search).get("plan");
    if (plan === "annual" || plan === "monthly") setInterval(plan);
  }, []);

  const price = PRICES[interval];
  const firstCharge = addDays(localToday(), TRIAL_DAYS);
  const alreadyPlus = store.ready && store.state.subscription !== null && status === "form";

  const pay = () => {
    if (!name.trim()) return setError({ field: "name", message: "Enter the name on the card." });
    if (!/^\d{5}$/.test(zip.trim())) return setError({ field: "zip", message: "Enter a 5-digit ZIP code." });
    const r = checkTestCard(number, expiry, cvc, new Date());
    if (!r.ok) return setError({ field: r.field, message: r.message });
    setError(null);
    setStatus("processing");
    setTimeout(() => {
      store.startPlus(interval);
      setStatus("done");
    }, 900);
  };

  const fillTest = () => {
    setName("Sarah Demo");
    setNumber(TEST_CARD.number);
    setExpiry(TEST_CARD.expiry);
    setCvc(TEST_CARD.cvc);
    setZip(TEST_CARD.zip);
    setError(null);
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <Link href="/app" className="text-lg font-semibold tracking-tight text-slate-900">
          Split<span className="text-teal-700">Safe</span>
        </Link>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">TEST MODE</span>
      </header>

      <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950 ring-1 ring-amber-300">
        <strong>Test mode — no real charge.</strong> Use card <span className="font-mono">4242 4242 4242 4242</span>, any future expiry, any 3-digit CVC and any
        5-digit ZIP. <span className="font-mono">4000 0000 0000 0002</span> shows a decline.{" "}
        <button type="button" onClick={fillTest} className="font-semibold underline underline-offset-2">
          Fill in the test card
        </button>
      </div>

      {status === "done" ? (
        <Card className="text-center">
          <p className="text-4xl" aria-hidden>
            🎉
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Your {TRIAL_DAYS}-day free trial has started</h1>
          <p className="mt-2 text-slate-600">
            Every Plus feature now runs on your own numbers. After the trial: {price.label} from {formatDate(firstCharge)} (test mode, nothing will be charged).
          </p>
          <Link href="/app" className="mt-6 inline-block rounded-xl bg-teal-700 px-6 py-3 font-semibold text-white hover:bg-teal-800">
            Back to my calendar
          </Link>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-[1fr_20rem]">
          <Card>
            <h1 className="text-xl font-semibold text-slate-900">Start your {TRIAL_DAYS}-day free trial</h1>
            <p className="mt-1 text-sm text-slate-600">
              $0.00 today. {price.label} starting {formatDate(firstCharge)} unless you cancel before then.
            </p>
            {alreadyPlus && <p className="mt-2 text-sm text-emerald-700">You already have Plus. You can switch billing below.</p>}
            <form
              className="mt-5 flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                pay();
              }}
            >
              <Field label="Name on card">
                {(id) => <Input id={id} autoComplete="cc-name" value={name} invalid={error?.field === "name"} onChange={(e) => setName(e.target.value)} />}
              </Field>
              <Field label="Card number">
                {(id) => (
                  <Input
                    id={id}
                    inputMode="numeric"
                    autoComplete="cc-number"
                    placeholder="4242 4242 4242 4242"
                    value={number}
                    invalid={error?.field === "number"}
                    onChange={(e) => setNumber(e.target.value.replace(/[^\d ]/g, "").slice(0, 23))}
                  />
                )}
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Expiry">
                  {(id) => <Input id={id} placeholder="MM / YY" autoComplete="cc-exp" value={expiry} invalid={error?.field === "expiry"} onChange={(e) => setExpiry(e.target.value)} />}
                </Field>
                <Field label="CVC">
                  {(id) => <Input id={id} inputMode="numeric" autoComplete="cc-csc" value={cvc} invalid={error?.field === "cvc"} onChange={(e) => setCvc(e.target.value)} />}
                </Field>
                <Field label="ZIP">
                  {(id) => <Input id={id} inputMode="numeric" autoComplete="postal-code" value={zip} invalid={error?.field === "zip"} onChange={(e) => setZip(e.target.value)} />}
                </Field>
              </div>
              {error && (
                <p role="alert" className="text-sm text-red-700">
                  {error.message}
                </p>
              )}
              <Button type="submit" size="lg" disabled={status === "processing"}>
                {status === "processing" ? "Processing…" : `Start free trial (test)`}
              </Button>
              <p className="text-xs text-slate-500">Card details are checked in your browser only and are never stored or sent anywhere.</p>
            </form>
          </Card>

          <Card className="h-fit">
            <h2 className="text-sm font-semibold text-slate-700">SplitSafe Plus</h2>
            <fieldset className="mt-3 flex flex-col gap-2">
              <legend className="sr-only">Billing</legend>
              {(Object.keys(PRICES) as BillingInterval[]).map((k) => (
                <label key={k} className={cx("cursor-pointer rounded-lg p-3 ring-1", interval === k ? "bg-teal-50 ring-2 ring-teal-700" : "ring-slate-300")}>
                  <input type="radio" name="billing" className="sr-only" checked={interval === k} onChange={() => setInterval(k)} />
                  <span className="block font-semibold text-slate-900">{PRICES[k].label}</span>
                  <span className="block text-xs text-slate-600">{PRICES[k].billed}</span>
                </label>
              ))}
            </fieldset>
            <ul className="mt-4 flex flex-col gap-1.5 text-sm text-slate-700">
              {PLUS_FEATURES.map((f) => (
                <li key={f}>✓ {f}</li>
              ))}
            </ul>
            <div className="mt-4 flex justify-between border-t border-slate-200 pt-3 font-semibold text-slate-900">
              <span>Due today</span>
              <span>$0.00</span>
            </div>
            <div className="mt-1 flex justify-between text-sm text-slate-600">
              <span>From {formatDate(firstCharge)}</span>
              <span>{formatMoney(price.amount)}</span>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
