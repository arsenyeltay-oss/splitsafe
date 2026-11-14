import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/engine";
import { analyzeStatement, bnplProvider, merchantKey, payeeName } from "./analyze";
import { parseBankDate, parseCsv, parseMoney, parseStatement } from "./csv";
import { sampleStatementCsv } from "./sample-statement";

const TODAY = "2026-11-14";

describe("CSV parsing", () => {
  it("handles quotes, commas and escaped quotes", () => {
    expect(parseCsv('a,"b, c","d ""e"""\n1,2,3\n')).toEqual([
      ["a", "b, c", 'd "e"'],
      ["1", "2", "3"],
    ]);
  });

  it("parses US bank dates and money formats", () => {
    expect(parseBankDate("11/03/2026")).toBe("2026-11-03");
    expect(parseBankDate("1/5/26")).toBe("2026-01-05");
    expect(parseBankDate("2026-11-03")).toBe("2026-11-03");
    expect(parseBankDate("02/30/2026")).toBeNull();
    expect(parseMoney("$1,234.50")).toBe(1234.5);
    expect(parseMoney("(45.00)")).toBe(-45);
    expect(parseMoney("abc")).toBeNull();
  });

  it("reads a single Amount column (Chase style)", () => {
    const s = parseStatement("Details,Posting Date,Description,Amount,Type,Balance\nDEBIT,11/10/2026,KLARNA* NIKE,-40.00,DEBIT_CARD,340.00\n");
    expect(s.txns).toEqual([{ date: "2026-11-10", description: "KLARNA* NIKE", amount: -40, balance: 340 }]);
  });

  it("reads separate Debit / Credit columns", () => {
    const s = parseStatement("Date,Description,Debit,Credit\n11/10/2026,RENT,1200.00,\n11/11/2026,PAYROLL,,1450.00\n");
    expect(s.txns.map((t) => t.amount)).toEqual([-1200, 1450]);
  });

  it("reads header-less exports by content (Wells Fargo style)", () => {
    const s = parseStatement('"11/10/2026","-40.00","*","","KLARNA* NIKE"\n"11/11/2026","1450.00","*","","ACME PAYROLL"\n');
    expect(s.txns.map((t) => [t.date, t.amount, t.description])).toEqual([
      ["2026-11-10", -40, "KLARNA* NIKE"],
      ["2026-11-11", 1450, "ACME PAYROLL"],
    ]);
  });

  it("gives a friendly error for files that aren't statements", () => {
    expect(() => parseStatement("hello,world\nfoo,bar\n")).toThrow(/date and amount/);
  });
});

describe("statement analysis", () => {
  it("recognises BNPL descriptors and stable merchant keys", () => {
    expect(bnplProvider("KLARNA* NIKE")).toBe("klarna");
    expect(bnplProvider("AFTERPAY US INC")).toBe("afterpay");
    expect(bnplProvider("PAYPAL *PAY IN 4")).toBe("paypal");
    expect(bnplProvider("PAYPAL *EBAY")).toBeNull();
    expect(merchantKey("ACME CORP PAYROLL PPD ID: 123")).toBe("ACME CORP PAYROLL PPD");
    expect(payeeName("ZELLE PAYMENT TO OAKWOOD APTS LLC")).toBe("Oakwood Apts");
    expect(payeeName("NETFLIX.COM")).toBe("Netflix");
  });

  const analysis = analyzeStatement(parseStatement(sampleStatementCsv(TODAY)).txns, TODAY, "t");

  it("finds the balance, the biweekly paycheck and the next payday", () => {
    expect(analysis.balance).toEqual({ amount: 380, asOf: analysis.to });
    expect(analysis.paycheck).toMatchObject({ amount: 1450, frequency: "biweekly", nextPayday: addDays(TODAY, 8) });
  });

  it("finds monthly bills and marks essentials, but not variable spending", () => {
    const byName = Object.fromEntries(analysis.bills.map((b) => [b.name, b]));
    expect(byName["Oakwood Apts"]).toMatchObject({ amount: 1200, essential: true });
    expect(byName["Netflix"]).toMatchObject({ amount: 22, essential: false });
    expect(byName["City Power & Light"]).toMatchObject({ amount: 120, essential: true });
    expect(analysis.bills.some((b) => /Kroger|Starbucks|Shell/.test(b.name))).toBe(false);
    expect(analysis.everydayPerMonth).toBeGreaterThan(300);
  });

  it("turns BNPL autopays into plan drafts, flagging what a statement can't know", () => {
    const klarna = analysis.plans.find((p) => p.provider === "klarna")!;
    expect(klarna.merchant).toBe("Nike");
    expect(klarna.totalAmount).toBe(160);
    expect(klarna.installments.filter((i) => i.status === "paid")).toHaveLength(1);
    expect(klarna.installments).toHaveLength(4);
    expect(klarna.missingFields.join(" ")).toMatch(/estimated/);
    // Sarah's Affirm plan hasn't charged yet, so it can't be in the statement.
    expect(analysis.plans.some((p) => p.provider === "affirm")).toBe(false);
  });

  it("the sample statement looks like a real account: checking never sits deep in the red", () => {
    const txns = parseStatement(sampleStatementCsv(TODAY)).txns;
    expect(Math.min(...txns.map((t) => t.balance!))).toBeGreaterThanOrEqual(0);
    expect(txns[0].balance).toBe(380);
    expect(txns.some((t) => /TRANSFER TO SAV/.test(t.description))).toBe(true);
  });

  it("transfers to your own savings are neither bills nor everyday spending", () => {
    const csv =
      "Date,Description,Amount\n09/05/2026,ONLINE TRANSFER TO SAV 1234,-300\n10/05/2026,ONLINE TRANSFER TO SAV 1234,-300\n11/05/2026,ONLINE TRANSFER TO SAV 1234,-300\n";
    const a = analyzeStatement(parseStatement(csv).txns, TODAY, "x");
    expect(a.bills).toEqual([]);
    expect(a.everydayPerMonth).toBe(0);
  });

  it("a monthly BNPL plan leaves the total and remaining payments to the user", () => {
    const csv = "Date,Description,Amount\n09/05/2026,AFFIRM* PELOTON,-67.42\n10/05/2026,AFFIRM* PELOTON,-67.42\n";
    const [plan] = analyzeStatement(parseStatement(csv).txns, TODAY, "x").plans;
    expect(plan).toMatchObject({ provider: "affirm", merchant: "Peloton", totalAmount: null, confidence: "low" });
    expect(plan.installments.at(-1)).toEqual({ dueDate: "", amount: 67.42, status: "upcoming" });
  });
});
