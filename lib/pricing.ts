/** Single source of truth for prices shown on the landing page, paywall and checkout. */
export const PRICES = {
  monthly: { amount: 4.99, label: "$4.99 / month", billed: "Billed monthly · cancel anytime" },
  annual: { amount: 39.99, label: "$39.99 / year", billed: "Billed yearly · $3.33/mo, save 33%" },
} as const;

export type BillingInterval = keyof typeof PRICES;

export const PLUS_FEATURES = [
  "Unlimited “Can I afford this?” checks (free plan: 3 a month)",
  "Calendar alerts: every BNPL payment and danger day in Google, Apple or Outlook Calendar, with reminders",
  "Pay-off-early planner: the earliest safe date to clear each plan and the interest you'd save",
];

export const FREE_FEATURES = [
  "90-day cash calendar with danger days",
  "“Safe to spend until payday” number",
  "Weekly check-in and payoff progress",
  "“How to fix” options for your next danger day",
  "Paste BNPL emails, or add plans by hand",
  "Rescue mode and hardship messages — always free",
  "3 “Can I afford this?” checks a month",
];

/** Luhn checksum for card numbers. */
export function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return digits.length >= 12 && sum % 10 === 0;
}

export type TestCardResult = { ok: true } | { ok: false; field: "number" | "expiry" | "cvc"; message: string };

/**
 * Test-mode card check, modelled on Stripe's test cards: 4242… succeeds, 4000 0000 0000 0002 is
 * declined. No card data leaves the browser and nothing is charged.
 */
export function checkTestCard(number: string, expiry: string, cvc: string, now: Date): TestCardResult {
  const digits = number.replace(/\s+/g, "");
  if (!/^\d{12,19}$/.test(digits) || !luhnValid(digits)) return { ok: false, field: "number", message: "That card number isn't valid." };
  if (digits === "4000000000000002") return { ok: false, field: "number", message: "Your card was declined (test decline card)." };
  const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(expiry.trim());
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) return { ok: false, field: "expiry", message: "Use MM / YY." };
  const expEnd = new Date(2000 + Number(m[2]), Number(m[1]), 1);
  if (expEnd <= now) return { ok: false, field: "expiry", message: "This card has expired." };
  if (!/^\d{3,4}$/.test(cvc.trim())) return { ok: false, field: "cvc", message: "Enter the 3-digit security code." };
  return { ok: true };
}
