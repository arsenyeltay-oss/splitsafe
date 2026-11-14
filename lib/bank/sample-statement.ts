import { addDays, addMonths, daysInMonth, makeDate, roundMoney, yearMonth } from "@/lib/engine";
import type { ISODate } from "@/lib/engine";
import { samplePlans, sampleProfile } from "@/lib/sample-data";

/**
 * A realistic Chase-style checking export for the sample persona (Sarah), ending yesterday, so the
 * jury can try the bank import without a US bank account. It goes through the same parser and
 * analysis as a real file; nothing about the result is pre-computed.
 */

interface Row {
  date: ISODate;
  description: string;
  amount: number;
}

/** Deterministic pseudo-random amounts so the file is the same for a given day. */
function rng(seed: number) {
  let x = seed % 2147483647 || 1;
  return () => (x = (x * 48271) % 2147483647) / 2147483647;
}

const usDate = (d: ISODate) => {
  const { year, month, day } = yearMonth(d);
  return `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}/${year}`;
};

const BILL_DESCRIPTORS: Record<string, string> = {
  rent: "ZELLE PAYMENT TO OAKWOOD APTS LLC",
  phone: "VERIZON WIRELESS PAYMENTS",
  car: "GEICO AUTO INSURANCE",
  streaming: "NETFLIX.COM",
  utilities: "CITY POWER & LIGHT ONLINE PMT",
};

export function sampleStatementCsv(today: ISODate, days = 75): string {
  const start = addDays(today, -days);
  const end = addDays(today, -1);
  const profile = sampleProfile(today);
  const rows: Row[] = [];
  const inRange = (d: ISODate) => d >= start && d <= end;

  // Paychecks every two weeks before the next payday.
  for (let d = addDays(profile.nextPayday, -14); d >= start; d = addDays(d, -14)) {
    if (inRange(d)) rows.push({ date: d, description: "ACME LOGISTICS PAYROLL PPD ID: 9876543210", amount: profile.paycheckAmount });
  }

  // Fixed monthly bills on their day of month.
  for (const bill of profile.bills) {
    const descriptor = BILL_DESCRIPTORS[bill.id];
    if (!descriptor) continue;
    for (let i = 0; i < 4; i++) {
      const { year, month } = yearMonth(addMonths(makeDate(yearMonth(today).year, yearMonth(today).month, 1), -i));
      const d = makeDate(year, month, Math.min(bill.dayOfMonth, daysInMonth(year, month)));
      if (inRange(d)) rows.push({ date: d, description: descriptor, amount: -bill.amount });
    }
  }

  // BNPL autopays that already happened.
  for (const plan of samplePlans(today)) {
    const merchant = plan.merchant.toUpperCase();
    const descriptor =
      plan.provider === "klarna" ? `KLARNA* ${merchant}` : plan.provider === "afterpay" ? `AFTERPAY* ${merchant}` : `AFFIRM* ${merchant}`;
    for (const i of plan.installments) if (inRange(i.dueDate)) rows.push({ date: i.dueDate, description: descriptor, amount: -i.amount });
  }

  // Everyday spending: groceries, gas, coffee, online orders.
  const rand = rng(Number(today.replace(/-/g, "")));
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (dow === 6) rows.push({ date: d, description: "KROGER #0482", amount: -roundMoney(70 + rand() * 45) });
    if (dow === 3) rows.push({ date: d, description: "SHELL OIL 57442190", amount: -roundMoney(32 + rand() * 18) });
    if (rand() < 0.35) rows.push({ date: d, description: "STARBUCKS STORE 11823", amount: -roundMoney(4.5 + rand() * 3) });
    if (rand() < 0.08) rows.push({ date: d, description: "AMAZON MKTPL*2K4LQ1", amount: -roundMoney(12 + rand() * 40) });
  }

  // Running balance that ends at the persona's current balance.
  rows.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
  let balance = roundMoney(profile.balance - rows.reduce((s, r) => s + r.amount, 0));
  const withBalance = rows.map((r) => {
    balance = roundMoney(balance + r.amount);
    return { ...r, balance };
  });

  const lines = ["Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #"];
  for (const r of [...withBalance].reverse()) {
    const type = r.amount > 0 ? "ACH_CREDIT" : /ZELLE|PMT|PAYMENTS|INSURANCE/.test(r.description) ? "ACH_DEBIT" : "DEBIT_CARD";
    lines.push([r.amount > 0 ? "CREDIT" : "DEBIT", usDate(r.date), `"${r.description}"`, r.amount.toFixed(2), type, r.balance.toFixed(2), ""].join(","));
  }
  return lines.join("\n") + "\n";
}
