import { yearMonth } from "./dates";
import type { ISODate } from "./types";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "December 12, 2026" — deterministic and locale-independent (used in generated messages). */
export function formatISOForMessage(date: ISODate): string {
  const { year, month, day } = yearMonth(date);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}
