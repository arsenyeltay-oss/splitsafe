"use client";

import Link from "next/link";
import { useState } from "react";
import { PLUS_FEATURES, PRICES, type BillingInterval } from "@/lib/pricing";
import { cx, Modal } from "./ui";

/** Shown when a Free user hits a Plus feature. Leads to the test-mode checkout. */
export function Paywall({ open, onClose, reason }: { open: boolean; onClose: () => void; reason: string }) {
  const [interval, setInterval] = useState<BillingInterval>("annual");
  return (
    <Modal open={open} onClose={onClose} title="Upgrade to SplitSafe Plus">
      <p className="text-sm text-slate-700">{reason}</p>
      <ul className="mt-4 flex flex-col gap-2 text-sm text-slate-800">
        {PLUS_FEATURES.map((f) => (
          <li key={f} className="flex gap-2">
            <span aria-hidden className="text-teal-700">✓</span>
            {f}
          </li>
        ))}
      </ul>
      <fieldset className="mt-5 grid grid-cols-2 gap-2">
        <legend className="sr-only">Billing</legend>
        {(Object.keys(PRICES) as BillingInterval[]).map((k) => (
          <label
            key={k}
            className={cx("cursor-pointer rounded-xl p-3 ring-1", interval === k ? "bg-teal-50 ring-2 ring-teal-700" : "ring-slate-300")}
          >
            <input type="radio" name="interval" className="sr-only" checked={interval === k} onChange={() => setInterval(k)} />
            <span className="block font-semibold text-slate-900">{PRICES[k].label}</span>
            <span className="block text-xs text-slate-600">{PRICES[k].billed}</span>
          </label>
        ))}
      </fieldset>
      <Link
        href={`/checkout?plan=${interval}`}
        className="mt-5 block rounded-xl bg-teal-700 px-4 py-3 text-center font-semibold text-white hover:bg-teal-800"
      >
        Continue to checkout
      </Link>
      <p className="mt-3 text-center text-xs text-slate-500">Test mode for the demo: you&apos;ll see a test card to use. No real charge.</p>
    </Modal>
  );
}
