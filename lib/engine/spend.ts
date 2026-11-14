import { addDays } from "./dates";
import { roundMoney } from "./money";
import { generatePaydays } from "./paydays";
import type { CashProfile, DayResult, ISODate } from "./types";

export interface SafeToSpend {
  /** Extra money that can leave checking today without any day before payday dropping under the buffer. */
  amount: number;
  /** Next paycheck date (the window ends the day before). */
  until: ISODate;
  /** Lowest projected balance in the window, before any extra spending. */
  lowPoint: number;
  lowPointDate: ISODate;
}

/**
 * "Safe to spend until payday": the lowest projected balance between today and the day before the
 * next paycheck, minus the buffer, floored at $0. Spending it today lowers every later day equally,
 * so this is exactly the largest amount that keeps the whole window at or above the buffer.
 */
export function safeToSpend(days: DayResult[], profile: CashProfile): SafeToSpend | null {
  if (days.length === 0) return null;
  const today = days[0].date;
  const payday = generatePaydays(profile.frequency, profile.nextPayday, addDays(today, 1), addDays(today, 62))[0];
  if (!payday) return null;
  const window = days.filter((d) => d.date < payday);
  const low = window.reduce((m, d) => (d.endBalance < m.endBalance ? d : m), window[0]);
  return {
    amount: roundMoney(Math.max(0, low.endBalance - profile.buffer)),
    until: payday,
    lowPoint: low.endBalance,
    lowPointDate: low.date,
  };
}
