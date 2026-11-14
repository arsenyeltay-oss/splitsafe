import Link from "next/link";
import { WaitlistButton } from "@/components/waitlist-button";

const STEPS = [
  {
    n: "1",
    title: "Paste",
    body: "Drop in your Klarna, Affirm, Afterpay, PayPal, Zip or Sezzle confirmation emails. We pull out every payment — you check them.",
  },
  {
    n: "2",
    title: "See your danger days",
    body: "Every plan, bill and paycheck on one 90-day calendar. Red where you'd go negative, amber where it gets tight.",
  },
  {
    n: "3",
    title: "Decide",
    body: "Before you click Pay in 4, ask “Can I afford this?” and get SAFE, TIGHT or NO — plus a date that would work.",
  },
];

const FREE = ["90-day cash calendar", "Danger-day & debt-free date", "Paste emails or add plans by hand", "Rescue mode with hardship messages"];
const PLUS = ["Unlimited “Can I afford this?” checks", "Alerts before a danger day", "Weekly forecast email", "Everything in Free"];

export default function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <span className="text-lg font-semibold tracking-tight text-slate-900">
          Split<span className="text-teal-700">Safe</span>
        </span>
        <Link href="/app" className="text-sm font-medium text-slate-700 hover:text-slate-900">
          Open the app →
        </Link>
      </header>

      <main>
        <section className="mx-auto max-w-4xl px-4 pb-16 pt-12 text-center sm:px-6 sm:pt-20">
          <p className="mb-4 inline-block rounded-full bg-teal-50 px-3 py-1 text-sm font-medium text-teal-800 ring-1 ring-teal-200">
            BNPL isn&apos;t the problem. Flying blind is.
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-6xl">Know before you Pay in 4.</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            Each BNPL app only shows its own plans. SplitSafe lines them all up against your paycheck, so you see the overdraft coming — not the
            late fee after.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/app?sample=1" className="rounded-xl bg-teal-700 px-6 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-teal-800">
              Try it with sample data
            </Link>
            <Link href="/app?start=1" className="rounded-xl bg-white px-6 py-3.5 text-base font-semibold text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50">
              Add my plans
            </Link>
          </div>
          <p className="mt-4 text-sm text-slate-500">No sign-up. Your data stays in your browser. We&apos;re not a lender.</p>
        </section>

        <section aria-labelledby="how" className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <h2 id="how" className="sr-only">
            How it works
          </h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-700 font-semibold text-white">{s.n}</span>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{s.body}</p>
              </li>
            ))}
          </ol>

          <div className="mx-auto mt-10 max-w-3xl rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm font-medium text-slate-500">Example danger day</p>
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-2xl font-semibold text-red-700">3 days before payday — short by $21.63</p>
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Short</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">Klarna $40 + Phone $65 + Afterpay $30 + Affirm $156.63 + Car insurance $110, all autopaying from $380 in checking. Each app only knew about its own $30–$157.</p>
          </div>
        </section>

        <section aria-labelledby="checkout" className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="grid items-center gap-8 rounded-3xl bg-slate-900 p-8 text-white md:grid-cols-2 sm:p-10">
            <div>
              <h2 id="checkout" className="text-2xl font-semibold tracking-tight sm:text-3xl">
                The check shows up right at checkout.
              </h2>
              <p className="mt-3 text-slate-300">
                The SplitSafe browser extension spots “4 payments of $60” on a store&apos;s checkout page and tells you SAFE, TIGHT or NO before you
                click — computed on your device, nothing sent anywhere.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/demo/checkout" className="rounded-xl bg-white px-5 py-3 font-semibold text-slate-900 hover:bg-slate-100">
                  Try the checkout demo
                </Link>
                <a href="/splitsafe-extension.zip" className="rounded-xl px-5 py-3 font-semibold text-white ring-1 ring-white/40 hover:bg-white/10">
                  Download Chrome extension
                </a>
              </div>
              <p className="mt-3 text-xs text-slate-400">Unzip, open chrome://extensions, turn on Developer mode, “Load unpacked”.</p>
            </div>
            <div className="rounded-2xl bg-red-50 p-5 text-slate-900 ring-2 ring-red-300">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">SplitSafe check</p>
              <p className="mt-1 text-lg font-semibold text-red-800">✕ Not right now</p>
              <p className="mt-1 text-sm">$240.00 with Klarna would leave you $81.63 short in 5 days.</p>
              <p className="mt-1 text-sm text-slate-700">💡 Safe to buy after your next two paychecks.</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="pricing" className="bg-white py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <h2 id="pricing" className="text-center text-3xl font-semibold tracking-tight text-slate-900">
              Simple pricing
            </h2>
            <p className="mt-2 text-center text-slate-600">The tools you need in a tough month are always free.</p>
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              <div className="flex flex-col rounded-2xl p-6 ring-1 ring-slate-200">
                <h3 className="text-lg font-semibold text-slate-900">Free</h3>
                <p className="mt-1 text-3xl font-semibold text-slate-900">$0</p>
                <ul className="mt-5 flex flex-1 flex-col gap-2 text-sm text-slate-700">
                  {FREE.map((f) => (
                    <li key={f}>✓ {f}</li>
                  ))}
                </ul>
                <Link href="/app?sample=1" className="mt-6 rounded-xl bg-white px-6 py-3 text-center font-semibold text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50">
                  Start free
                </Link>
              </div>
              <div className="flex flex-col rounded-2xl p-6 ring-2 ring-teal-700">
                <h3 className="text-lg font-semibold text-slate-900">Plus</h3>
                <p className="mt-1 text-3xl font-semibold text-slate-900">
                  $4.99<span className="text-base font-normal text-slate-500">/mo</span>
                </p>
                <ul className="mt-5 flex flex-1 flex-col gap-2 text-sm text-slate-700">
                  {PLUS.map((f) => (
                    <li key={f}>✓ {f}</li>
                  ))}
                </ul>
                <div className="mt-6">
                  <WaitlistButton />
                </div>
              </div>
            </div>
            <p className="mt-6 text-center text-xs text-slate-500">During the demo, every feature is unlocked for everyone.</p>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-4 py-8 text-xs text-slate-500 sm:px-6">
        SplitSafe is not a lender and never sells credit. Not financial advice. Provider rules change — check your provider&apos;s terms.
      </footer>
    </div>
  );
}
