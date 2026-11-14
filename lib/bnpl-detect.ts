import { normalizeProvider, roundMoney } from "@/lib/engine";
import type { ProviderId, PurchaseInput } from "@/lib/engine";

export interface DetectedOffer {
  input: PurchaseInput;
  /** The text that matched, e.g. "4 interest-free payments of $60.00". */
  match: string;
}

const MONEY = String.raw`\$\s?([\d,]+(?:\.\d{1,2})?)`;
const PAY_IN_N = new RegExp(String.raw`\b(\d{1,2})\s+(?:interest[- ]free\s+)?(?:bi-?weekly\s+)?(?:payments|installments)\s+of\s+${MONEY}`, "i");
const MONTHLY_N = new RegExp(String.raw`\b(\d{1,2})\s+monthly\s+(?:payments|installments)\s+of\s+${MONEY}`, "i");
const PER_MONTH = new RegExp(String.raw`${MONEY}\s*\/\s*mo(?:nth)?\.?\s+(?:for|over)\s+(\d{1,2})\s+months`, "i");
const PROVIDER_RE = /\b(klarna|afterpay|clearpay|affirm|paypal|sezzle|zip|quadpay)\b/i;

const parseMoney = (s: string) => roundMoney(Number(s.replace(/,/g, "")));

/** Provider named closest to the offer text, falling back to the first one on the page. */
function findProvider(text: string, index: number): ProviderId {
  const window = text.slice(Math.max(0, index - 300), index + 300);
  const near = PROVIDER_RE.exec(window) ?? PROVIDER_RE.exec(text);
  return near ? normalizeProvider(near[1]) : "other";
}

/**
 * Finds a BNPL offer in visible page text. Deterministic and conservative: only explicit
 * "N payments of $X" style offers are recognized, so we never guess a price.
 */
export function detectOffer(text: string): DetectedOffer | null {
  const monthly = MONTHLY_N.exec(text);
  if (monthly) {
    const months = Number(monthly[1]);
    const per = parseMoney(monthly[2]);
    if (months >= 2 && per > 0) {
      return {
        input: { amount: roundMoney(per * months), provider: findProvider(text, monthly.index), term: { kind: "monthly", months, apr: 0 } },
        match: monthly[0],
      };
    }
  }
  const perMonth = PER_MONTH.exec(text);
  if (perMonth) {
    const per = parseMoney(perMonth[1]);
    const months = Number(perMonth[2]);
    if (months >= 2 && per > 0) {
      return {
        input: { amount: roundMoney(per * months), provider: findProvider(text, perMonth.index), term: { kind: "monthly", months, apr: 0 } },
        match: perMonth[0],
      };
    }
  }
  const payIn = PAY_IN_N.exec(text);
  if (payIn && Number(payIn[1]) === 4) {
    const per = parseMoney(payIn[2]);
    if (per > 0) {
      return { input: { amount: roundMoney(per * 4), provider: findProvider(text, payIn.index), term: { kind: "payin4" } }, match: payIn[0] };
    }
  }
  return null;
}
