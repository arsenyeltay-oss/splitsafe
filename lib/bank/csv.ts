import { isValidISODate, makeDate, roundMoney } from "@/lib/engine";
import type { ISODate } from "@/lib/engine";

/** One bank transaction. Amount is negative for money out, positive for money in. */
export interface BankTxn {
  date: ISODate;
  description: string;
  amount: number;
  /** Running balance after this transaction, when the bank includes it. */
  balance: number | null;
}

/** RFC 4180-ish CSV: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((f) => f.trim()));
}

/** Dates as US banks export them: MM/DD/YYYY, M/D/YY, or YYYY-MM-DD. */
export function parseBankDate(s: string): ISODate | null {
  const t = s.trim();
  if (isValidISODate(t)) return t;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(t);
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = makeDate(year, Number(m[1]), Number(m[2]));
  return isValidISODate(d) && d === `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` ? d : null;
}

/** "$1,234.56", "(45.00)", "-12.3", "1234" → number; null if not a money value. */
export function parseMoney(s: string): number | null {
  const t = s.trim().replace(/[$,\s]/g, "");
  if (t === "") return null;
  const neg = /^\(.*\)$/.test(t);
  const n = Number(t.replace(/[()]/g, ""));
  if (!Number.isFinite(n)) return null;
  return roundMoney(neg ? -n : n);
}

const HEADER = {
  date: /^(posting |transaction |trans\.? |post )?date$/i,
  /** In priority order: Chase's "Details" column is DEBIT/CREDIT, so "Description" must win. */
  description: [/^description$/i, /^(payee|merchant|name)$/i, /^(memo|details?)$/i],
  amount: /^(amount|transaction amount)$/i,
  debit: /^(debit|withdrawals?|money out)$/i,
  credit: /^(credit|deposits?|money in)$/i,
  balance: /^(balance|running bal\.?|running balance|available balance)$/i,
};

export interface ParsedStatement {
  txns: BankTxn[];
  /** Columns we recognised, for the "how we read your file" note. */
  columns: string[];
}

/**
 * Reads a bank CSV export. Recognises common US layouts by header name (single Amount column, or
 * separate Debit/Credit), and header-less exports by content (a date column, a money column and the
 * longest text column). Throws a friendly error when no transactions can be read.
 */
export function parseStatement(text: string): ParsedStatement {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error("The file is empty.");

  const headerIdx = rows.findIndex((r) => r.some((c) => HEADER.date.test(c)) && r.some((c) => HEADER.amount.test(c) || HEADER.debit.test(c)));
  let col: { date: number; description: number; amount: number; debit: number; credit: number; balance: number };
  let body: string[][];

  if (headerIdx >= 0) {
    const h = rows[headerIdx];
    const find = (re: RegExp) => h.findIndex((c) => re.test(c));
    col = {
      date: find(HEADER.date),
      description: HEADER.description.map(find).find((i) => i >= 0) ?? -1,
      amount: find(HEADER.amount),
      debit: find(HEADER.debit),
      credit: find(HEADER.credit),
      balance: find(HEADER.balance),
    };
    body = rows.slice(headerIdx + 1);
  } else {
    // No header (e.g. Wells Fargo): infer columns from the first rows.
    const sample = rows.slice(0, 10);
    const width = Math.max(...sample.map((r) => r.length));
    const share = (i: number, test: (s: string) => boolean) => sample.filter((r) => r[i] !== undefined && test(r[i])).length / sample.length;
    const idx = [...Array(width).keys()];
    const date = idx.find((i) => share(i, (s) => parseBankDate(s) !== null) > 0.8) ?? -1;
    const amount = idx.find((i) => i !== date && share(i, (s) => parseMoney(s) !== null && /\d/.test(s)) > 0.8) ?? -1;
    const description = idx
      .filter((i) => i !== date && i !== amount)
      .sort((a, b) => sample.reduce((s, r) => s + (r[b]?.length ?? 0), 0) - sample.reduce((s, r) => s + (r[a]?.length ?? 0), 0))[0] ?? -1;
    col = { date, description, amount, debit: -1, credit: -1, balance: -1 };
    body = rows;
  }

  if (col.date < 0 || (col.amount < 0 && col.debit < 0)) {
    throw new Error("We couldn't find date and amount columns. Export a CSV from your bank's Activity or Statements page.");
  }

  const txns: BankTxn[] = [];
  for (const r of body) {
    const date = parseBankDate(r[col.date] ?? "");
    if (!date) continue;
    let amount: number | null;
    if (col.amount >= 0) amount = parseMoney(r[col.amount] ?? "");
    else {
      const debit = parseMoney(r[col.debit] ?? "") ?? 0;
      const credit = col.credit >= 0 ? parseMoney(r[col.credit] ?? "") ?? 0 : 0;
      amount = roundMoney(credit - Math.abs(debit));
    }
    if (amount === null || amount === 0) continue;
    txns.push({
      date,
      description: (col.description >= 0 ? r[col.description] : "") || "Transaction",
      amount,
      balance: col.balance >= 0 ? parseMoney(r[col.balance] ?? "") : null,
    });
  }
  if (txns.length === 0) throw new Error("We couldn't read any transactions from this file.");

  const names = Object.entries(col)
    .filter(([, i]) => i >= 0)
    .map(([k]) => k);
  return { txns, columns: names };
}
