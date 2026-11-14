import { addDays, addMonths, formatISOForMessage, monthlySchedule, payIn4Schedule, yearMonth } from "@/lib/engine";
import type { CashProfile, Installment, ISODate, Plan } from "@/lib/engine";

/**
 * Demo persona: Sarah, 31. Paid $1,450 net every two weeks, rent $1,200 on the 1st, $380 in checking.
 * Everything is relative to `today` so the demo always shows a short day before her next payday.
 */

const markPastAsPaid = (installments: Installment[], today: ISODate): Installment[] =>
  installments.map((i) => ({ ...i, status: i.dueDate < today ? "paid" : "upcoming" }));

export function sampleProfile(today: ISODate): CashProfile {
  const dom = (offset: number) => yearMonth(addDays(today, offset)).day;
  return {
    balance: 380,
    paycheckAmount: 1450,
    frequency: "biweekly",
    nextPayday: addDays(today, 8),
    buffer: 100,
    bills: [
      { id: "rent", name: "Rent", amount: 1200, dayOfMonth: 1, essential: true },
      { id: "phone", name: "Phone", amount: 65, dayOfMonth: dom(3), essential: true },
      { id: "car", name: "Car insurance", amount: 110, dayOfMonth: dom(5), essential: true },
      { id: "streaming", name: "Streaming", amount: 22, dayOfMonth: dom(6), essential: false },
      { id: "groceries-1", name: "Groceries & gas", amount: 250, dayOfMonth: dom(10), essential: true },
      { id: "utilities", name: "Utilities", amount: 120, dayOfMonth: dom(12), essential: true },
      { id: "groceries-2", name: "Groceries & gas", amount: 250, dayOfMonth: dom(24), essential: true },
    ],
  };
}

/** Purchase dates for the three sample plans. */
function purchaseDates(today: ISODate) {
  return {
    klarna: addDays(today, -12),
    afterpay: addDays(today, -25),
    // Affirm's first monthly payment lands 4 days from today.
    affirm: addMonths(addDays(today, 4), -1),
  };
}

export function samplePlans(today: ISODate): Plan[] {
  const d = purchaseDates(today);
  return [
    {
      id: "sample-klarna",
      provider: "klarna",
      merchant: "Nike",
      totalAmount: 160,
      apr: null,
      installments: markPastAsPaid(payIn4Schedule(160, d.klarna), today),
      source: "parsed",
    },
    {
      id: "sample-afterpay",
      provider: "afterpay",
      merchant: "Urban Outfitters",
      totalAmount: 120,
      apr: null,
      installments: markPastAsPaid(payIn4Schedule(120, d.afterpay), today),
      source: "parsed",
    },
    {
      id: "sample-affirm",
      provider: "affirm",
      merchant: "Wayfair",
      totalAmount: 900,
      apr: 15,
      installments: markPastAsPaid(monthlySchedule(900, 6, 15, d.affirm), today),
      source: "parsed",
    },
  ];
}

const money = (n: number) => `$${n.toFixed(2)}`;

/** Three realistic confirmation emails matching `samplePlans` — used to demo the paste-and-parse flow. */
export function sampleEmails(today: ISODate): string {
  const d = purchaseDates(today);
  const klarna = payIn4Schedule(160, d.klarna);
  const afterpay = payIn4Schedule(120, d.afterpay);
  const affirm = monthlySchedule(900, 6, 15, d.affirm);
  const f = formatISOForMessage;

  return `From: Klarna <no-reply@klarna.com>
Date: ${f(d.klarna)}
Subject: Your Nike order is confirmed — Pay in 4

Hi Sarah,
Thanks for paying with Klarna! Your purchase from Nike for ${money(160)} is split into 4 interest-free payments of ${money(klarna[0].amount)}.
Your first payment of ${money(klarna[0].amount)} was charged today. The remaining 3 payments will be charged automatically every 2 weeks, starting ${f(klarna[1].dueDate)}.

-----

From: Afterpay <donotreply@afterpay.com>
Date: ${f(d.afterpay)}
Subject: Order confirmed: Urban Outfitters

Order total: ${money(120)}
Payment schedule:
  Payment 1: ${f(afterpay[0].dueDate)} — ${money(afterpay[0].amount)} (paid)
  Payment 2: ${f(afterpay[1].dueDate)} — ${money(afterpay[1].amount)}
  Payment 3: ${f(afterpay[2].dueDate)} — ${money(afterpay[2].amount)}
  Payment 4: ${f(afterpay[3].dueDate)} — ${money(afterpay[3].amount)}

-----

From: Affirm <notifications@affirm.com>
Date: ${f(d.affirm)}
Subject: You're all set! Your Wayfair loan is confirmed

Loan amount: ${money(900)}
APR: 15.00%
Term: 6 monthly payments of ${money(affirm[0].amount)}
First payment due: ${f(affirm[0].dueDate)}
Total of payments: ${money(affirm.reduce((s, i) => s + i.amount, 0))}
`;
}
