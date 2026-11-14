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

  // Like most people with a surplus, Sarah moves part of each paycheck to savings, keeping just
  // enough in checking to cover everything until later paychecks with a small cushion. Worked out
  // backwards from today's balance so every pay period stays above the cushion.
  const CUSHION = 60;
  rows.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
  const payIdx = rows.flatMap((r, i) => (r.amount > 0 ? [i] : []));
  // Segments: before the first paycheck, then from each paycheck (exclusive) to the next.
  const bounds = [-1, ...payIdx, rows.length];
  const seg = bounds.slice(0, -1).map((b, k) => {
    let run = 0;
    let low = 0;
    for (let i = b + 1; i < bounds[k + 1]; i++) low = Math.min(low, (run = roundMoney(run + rows[i].amount)));
    return { net: run, low };
  });
  // need[k]: the minimum balance at the start of segment k (after its paycheck and transfer).
  const last = seg.length - 1;
  const need: number[] = Array(seg.length);
  need[last] = roundMoney(profile.balance - seg[last].net);
  for (let k = last - 1; k >= 0; k--) {
    const pay = rows[payIdx[k]].amount;
    need[k] = roundMoney(Math.max(CUSHION - seg[k].low, need[k + 1] - seg[k].net - pay));
  }

  let balance = need[0];
  const withBalance: (Row & { balance: number })[] = [];
  const push = (r: Row) => withBalance.push({ ...r, balance: (balance = roundMoney(balance + r.amount)) });
  for (let k = 0; k < seg.length; k++) {
    if (k > 0) {
      push(rows[payIdx[k - 1]]);
      const transfer = roundMoney(balance - need[k]);
      if (transfer > 0) push({ date: rows[payIdx[k - 1]].date, description: "ONLINE TRANSFER TO SAV XXXXXX4821", amount: -transfer });
    }
    for (let i = bounds[k] + 1; i < bounds[k + 1]; i++) push(rows[i]);
  }

  const lines = ["Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #"];
  for (const r of [...withBalance].reverse()) {
    const type =
      r.amount > 0 ? "ACH_CREDIT" : /TRANSFER/.test(r.description) ? "ACCT_XFER" : /ZELLE|PMT|PAYMENTS|INSURANCE/.test(r.description) ? "ACH_DEBIT" : "DEBIT_CARD";
    lines.push([r.amount > 0 ? "CREDIT" : "DEBIT", usDate(r.date), `"${r.description}"`, r.amount.toFixed(2), type, r.balance.toFixed(2), ""].join(","));
  }
  return lines.join("\n") + "\n";
}
