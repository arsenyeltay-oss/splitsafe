# Decisions

Judgment calls made during the build, so reviewers can see what was decided and why.

## Engine semantics

- **Dates are timezone-free ISO calendar days** (`YYYY-MM-DD`), computed with UTC arithmetic. "Today" comes from the user's local clock and is passed into every engine function, which keeps the engine pure and testable.
- **Money is summed in integer cents** to avoid float drift. Amounts are stored in dollars.
- **`balance` means the balance at the start of today.** Today's events still apply to it.
- **Same-day order: income → bills → BNPL.** Direct deposits usually post overnight. A day's status is judged on its end-of-day balance, which is also its low point under this order.
- **Short means < $0, tight means < buffer.** The default buffer is $100.
- **Unpaid installments due before today count as overdue on today.** We don't drop them silently.
- **Paydays:** weekly and every-2-weeks step from the stated next payday. Monthly keeps the anchor day and clamps to month end (Jan 31 → Feb 28 → Mar 31). For twice-a-month, a payday on the 28th or later (or the last day) means "15th + last day"; otherwise the paydays are the stated day and 15 days apart (e.g. 1st & 16th). No paydays are generated before the stated next payday.
- **Pay in 4:** the first payment is due on the purchase date, then every 14 days. Leftover cents go on the first payment.
- **Monthly loans:** a standard amortized payment, with the first due one month after purchase and the last payment absorbing rounding. At 0% APR the payments sum to exactly the principal.

## Headline cards

- **"Already promised from your next paycheck"** includes BNPL *and* bills due from the next payday up to (not including) the following one, with a breakdown. Rent is promised money too.
- **"Next danger day"** is the first short day, or the first tight day if nothing is short. Its explanation lists the outflows since the last paycheck (or since today, labeled "before payday").

## Can I afford this?

- **The verdict judges the purchase's impact, not existing problems.** NO means some day ends below $0 *and* lower than it would without the purchase. TIGHT is the same test against the buffer. If the calendar is already short without the purchase, we say so separately rather than blaming the purchase.
- **Earliest safe date:** the first start date within 60 days (from tomorrow) that gives SAFE. The simulation horizon extends past the last installment so long plans are fully checked.
- **Safer term:** we try Pay in 4, then 3, 6 and 12 months. For monthly alternatives we use the user's APR. If they asked about Pay in 4, we assume 15% APR and say so in the UI ("check the real offer").

## Rescue mode

- **Allocation is per pay period, by priority**, not in autopay order. Otherwise rent would look like the problem when BNPL autopays drained the account earlier that week. Essential bills are always reserved (even if that overdraws). Other payments are covered only if they still fit.
- **At-risk payments aren't deducted** going forward. The plan assumes they get rescheduled through the hardship request, which avoids counting the same shortfall twice.
- **Ranking:** essential bills → BNPL that reports to credit bureaus → late-fee (or unverified) providers → no known penalty and non-essential bills. Bills have an `essential` flag; subscriptions can be unchecked.
- **Hardship messages are deterministic templates**, not LLM-generated: polite, specific to the provider's options, and free.

## LLM parsing

- **Model:** `ANTHROPIC_MODEL`, defaulting to `claude-opus-5-5`, at low effort (extraction is simple). Output is constrained with a zod schema (structured outputs) and re-validated with zod on the server. Invalid output gets one retry, then a friendly error that points to manual entry.
- **Server-side refusal fallbacks** (`fallbacks: "default"`) are on for models that support them, so a rare false-positive refusal doesn't break parsing.
- **Every schema field is required and nullable**, so the model can say "not stated". Code then flags those fields; we never fill them.
- **Schedules stated as rules are expanded in code.** If the email gives "first $40 charged today, then 3 payments every 2 weeks", the explicit payment is kept and the remainder is split evenly. If the rule is incomplete, nothing is expanded and the gap is flagged.
- **Limits:** input is capped at 20,000 characters, rate-limited to 10 requests per 10 minutes per IP (in memory, per instance), and the text is never logged or stored.

## Product

- **No auth, no database.** Data lives in localStorage, wrapped in try/catch and validated with zod on load. Corrupt data falls back to an empty state instead of crashing.
- **The waitlist email** is stored only in localStorage, and the modal says so.
- **Provider rules:** Affirm, Klarna and Afterpay follow the project brief and are marked verified as of 2026-11-14. PayPal Pay in 4, Zip and Sezzle are marked unverified, and the UI says so.
- **Sample data** is relative to today. Groceries/gas and utilities are included so the projection doesn't drift unrealistically upward. A test checks the story (a short day within 3 weeks, and a NO with a safe date for the $240 Klarna check) on all 366 days of a year.
- **Light theme only** for now, to guarantee accessible contrast in the time available.

## Checkout integration

- **No direct BNPL integration.** Klarna, Affirm, Afterpay and PayPal offer no public way for third parties to add messages inside their checkout. We demo the experience in two honest ways: a clearly labeled fictional store (`/demo/checkout`), and a working Chrome extension that operates at the page level.
- **Extension data flow:** a content script on the SplitSafe site copies the app's localStorage into `chrome.storage.local`. Checkout pages are checked on-device with the same engine. The only permission is `storage`, and the extension makes no network calls.
- **Detection is conservative:** only explicit "N payments of $X" / "N monthly payments of $X" / "$X/mo for N months" text is recognized. A price is never inferred from other numbers on the page. Monthly offers are evaluated at the shown payment (0% APR), because the shown payment already includes any interest.
- **Distribution:** `npm run build` runs `build:extension` first, so the live site serves a fresh `splitsafe-extension.zip`. Build output is git-ignored.
- **Verdict wording** lives in `lib/verdict-copy.ts` so the demo page and the extension can't drift apart. When the calendar is already short without the purchase, the copy says so instead of blaming the purchase alone.
