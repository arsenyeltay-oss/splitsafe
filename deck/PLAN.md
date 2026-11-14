# Pitch deck plan (agreed) — build in Canva

Rules from the case FAQ: **max 10 slides including the title**, **English**, **PDF**, no video (screenshots instead).
Scoring: Product & engineering 40% · Value & retention 20% · Problem & user 15% · Business potential 15% · Originality 10%.

The deck was built in Canva from this plan and exported to `deck/SplitSafe-pitch-deck.pdf` (the earlier HTML draft was removed). Slides in order:

## Slides

| # | Slide | Content |
|---|---|---|
| 1 | **Theme · startup · slogan** | **SplitSafe — "Know before you Pay in 4."** Second line: *"BNPL isn't the problem. Flying blind is."* One line: one calendar for every Buy Now, Pay Later plan, checked against your paycheck. Track: Money · B2C web. Links: splitsafe-phi.vercel.app · github.com/arsenyeltay-oss/splitsafe. Screenshot: `img/hero.png` |
| 2 | **Idea: why it came up** | Origin story, first person: *"When I was in the US, I kept seeing people run out of money before the end of the month because of installment payments."* Then "I wasn't the only one who noticed": **2 Reddit screenshots**: `img/reddit-tool.png` ("…can be a great tool especially when you're out of options") and `img/reddit-structure.png` ("…have a defined payoff date… game changer"). Captions: "Reddit, 2026", usernames removed. 3 stats: **63%** of BNPL borrowers had several loans at once, 33% across lenders (CFPB, Jan 2025 report, 2022 data) · **41%** paid late in the past year, up from 34% (LendingTree, Oct 2025) · since 2025 Affirm reports every loan, Pay in 4 included, to Experian & TransUnion |
| 3 | **The gap: uniqueness vs competitors** | Short table "what Sarah sees / what she can't": BNPL apps (Klarna, Affirm, Afterpay, PayPal) show only their own plans · budgeting apps (Monarch, YNAB, Rocket Money) are built on past bank transactions · bank alerts warn after the fact. **SplitSafe: all providers, 90 days forward, before you buy.** 3 differentiators: forward-looking across providers · check before Pay in 4 (in the app and at checkout) · private import with no bank login, and we're not a lender |
| 4 | **Product** (on Sarah) | Danger day (short $21.63 on Nov 19, and the payments that cause it) → "How to fix" → "Can I afford this?" = NO + safe date. Screenshots: `img/hero.png`, `img/fix.png`, `img/afford.png` |
| 5 | **How it works** | Import (bank CSV parsed on-device / emails via Claude) → deterministic engine (91 tests) → decide (app + checkout) → rescue. "Where AI is used and where it isn't" + privacy. Screenshot: `img/import.png` |
| 6 | **Why they pay & come back** | Plus $4.99/mo or $39.99/yr, 7 days free. Free: demo, data import, rescue. ROI: one overdraft ($34–35 at Chase / Wells Fargo) ≈ 7 months of Plus. Return loop: BNPL bills every 2 weeks → weekly check-in → progress → renewal. Screenshots: `img/gate.png`, `img/checkin.png`, `img/paywall.png` |
| 7 | **Unit economics** | LTV ≈ $60 (mix 60/40 annual/monthly, 8% monthly churn, 45% annual renewal, *assumptions*) · CAC ≤ $20 blended (creators ~$8, SEO ~$5, extension ~$3, paid social ~$27, *assumptions*) · LTV:CAC ≈ 3× · payback day 1 on annual, ~4–5 months on monthly. Trial→paid 30% (*assumption*, between RevenueCat 2026 medians 25.5% and 42.5%) |
| 8 | **Market & go-to-market** | 91.5M US BNPL users (eMarketer est. 2025) → ≈58M stack loans (× 63%, CFPB) → **2.1M subscribers × $48 ARPU = $100M ARR**. Channels: TikTok/Reddit, SEO ("Klarna late fee"), checkout extension, nonprofit credit counselors (user still pays) |
| 9 | **Built in 24 hours** | What works today, as a strip of screenshots: bank import, check-in, demo store, extension (`img/store.png`). 3-minute judge path + link |
| 10 | **Roadmap · team · close** | Plaid / FDX bank sync, SMS alerts before danger days, **"Not mine?" alerts** for new BNPL loans (`img/reddit-scam.png`: "a new loan has been made of 1800$"), Chrome Web Store, couples mode. Team: Arsen — solo founder & engineer. Final slogan + links |

## Sources (footnotes on slides)

- CFPB, "Consumer Use of Buy Now, Pay Later and Other Unsecured Debt", Jan 2025: https://files.consumerfinance.gov/f/documents/cfpb_BNPL_Report_2025_01.pdf
- LendingTree BNPL survey, Oct 2025 (n=2,000): https://www.lendingtree.com/personal/bnpl-late-survey/
- eMarketer US BNPL users (via CNBC / Oberlo): https://oberlo.com/statistics/buy-now-pay-later-us-users
- Affirm credit reporting (2025): https://www.bankrate.com/credit-cards/news/affirm-to-report-to-experian · https://www.pymnts.com/bnpl/2025/affirm-report-all-pay-over-time-loans-transunion/
- Klarna reports only monthly financing (Pay in 4 isn't reported): https://www.bankrate.com/credit-cards/advice/what-experts-want-you-to-know-about-bnpl-on-credit-reports
- Overdraft fees (Chase $34, Wells Fargo $35): https://www.bankrate.com/banking/checking/what-is-an-overdraft-fee · https://nclc.org/wp-content/uploads/2025/04/Overdraft-Fee-Issue-Brief-2025.pdf
- RevenueCat subscription benchmarks 2026: https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026/

## Assets

All in `deck/img/`. Product screenshots are from the live site at 2× resolution. Reddit screenshots have usernames removed.
