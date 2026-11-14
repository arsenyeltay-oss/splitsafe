import { describe, expect, it } from "vitest";
import { simulate } from "@/lib/engine";
import type { CashProfile, Plan } from "@/lib/engine";
import { buildIcs } from "./ics";

const TODAY = "2026-11-14";
const NOW = new Date("2026-11-14T10:00:00Z");
const profile: CashProfile = { balance: 50, paycheckAmount: 1000, frequency: "biweekly", nextPayday: "2026-11-20", bills: [], buffer: 100 };
const plans: Plan[] = [
  {
    id: "k1",
    provider: "klarna",
    merchant: "Nike, Inc.",
    totalAmount: 160,
    installments: [
      { dueDate: "2026-11-02", amount: 40, status: "paid" },
      { dueDate: "2026-11-16", amount: 40, status: "upcoming" },
      { dueDate: "2026-11-30", amount: 40, status: "upcoming" },
    ],
    source: "manual",
  },
];

describe("buildIcs", () => {
  const ics = buildIcs(plans, simulate(profile, plans, TODAY), profile.buffer, NOW);

  it("is a valid calendar with CRLF line endings", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });

  it("adds one all-day event per unpaid installment, escaping text", () => {
    expect(ics).toContain("DTSTART;VALUE=DATE:20261116");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261130");
    expect(ics).not.toContain("DTSTART;VALUE=DATE:20261102");
    expect(ics).toContain("SUMMARY:Klarna $40.00 · Nike\\, Inc.");
    expect(ics).toContain("DTSTAMP:20261114T100000Z");
  });

  it("warns once at the start of each short/tight stretch with an earlier reminder", () => {
    // $50 balance: tight from today; after the $40 payment on the 16th still tight (same stretch).
    expect(ics.match(/SUMMARY:⚠️ SplitSafe: tight/g)?.length).toBe(1);
    expect(ics).toContain("TRIGGER:-P2D");
  });
});
