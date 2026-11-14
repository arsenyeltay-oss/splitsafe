import { addDays, providerName } from "@/lib/engine";
import type { DayResult, ISODate, Plan } from "@/lib/engine";

/**
 * iCalendar (RFC 5545) export: every unpaid BNPL installment, plus a warning on the first day of
 * each short or tight stretch in the projection, with reminders ahead of time. Pure and deterministic
 * (the timestamp is passed in), so it is unit-tested like the engine.
 */

const compact = (d: ISODate) => d.replace(/-/g, "");

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds lines longer than 75 octets, as the spec requires (UTF-8 safe). */
function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > 73) {
      out.push(cur);
      cur = " ";
      bytes = 1;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n");
}

function allDayEvent(o: { uid: string; date: ISODate; summary: string; description: string; alarmDaysBefore: number; stamp: string }): string[] {
  return [
    "BEGIN:VEVENT",
    `UID:${o.uid}`,
    `DTSTAMP:${o.stamp}`,
    `DTSTART;VALUE=DATE:${compact(o.date)}`,
    `DTEND;VALUE=DATE:${compact(addDays(o.date, 1))}`,
    `SUMMARY:${escapeText(o.summary)}`,
    `DESCRIPTION:${escapeText(o.description)}`,
    "TRANSP:TRANSPARENT",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(o.summary)}`,
    `TRIGGER:-P${o.alarmDaysBefore}D`,
    "END:VALARM",
    "END:VEVENT",
  ];
}

const money = (n: number) => `$${n.toFixed(2)}`;

export function buildIcs(plans: Plan[], days: DayResult[], buffer: number, now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SplitSafe//Cash calendar//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:SplitSafe"];

  for (const plan of plans) {
    const total = plan.installments.length;
    plan.installments.forEach((inst, i) => {
      if (inst.status !== "upcoming") return;
      const name = providerName(plan.provider);
      lines.push(
        ...allDayEvent({
          uid: `splitsafe-${plan.id}-${inst.dueDate}-${i}@splitsafe`,
          date: inst.dueDate,
          summary: `${name} ${money(inst.amount)} · ${plan.merchant || "BNPL payment"}`,
          description: `Payment ${i + 1} of ${total} for ${plan.merchant || "your purchase"} (${money(plan.totalAmount)}). Autopay from checking. Added by SplitSafe.`,
          alarmDaysBefore: 1,
          stamp,
        }),
      );
    });
  }

  days.forEach((d, i) => {
    if (d.status === "ok" || days[i - 1]?.status === d.status) return;
    const short = d.status === "short";
    lines.push(
      ...allDayEvent({
        uid: `splitsafe-danger-${d.date}-${d.status}@splitsafe`,
        date: d.date,
        summary: short ? `⚠️ SplitSafe: short ${money(-d.endBalance)}` : `⚠️ SplitSafe: tight (${money(d.endBalance)})`,
        description: short
          ? `Projected checking balance ${money(d.endBalance)}. Open SplitSafe to see options: move a payment, pause a bill, or add cash before today.`
          : `Projected checking balance ${money(d.endBalance)}, under your ${money(buffer)} buffer.`,
        alarmDaysBefore: 2,
        stamp,
      }),
    );
  });

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
