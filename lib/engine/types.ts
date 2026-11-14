/** ISO calendar date, "YYYY-MM-DD". All engine dates are timezone-free calendar days. */
export type ISODate = string;

export type ProviderId = "affirm" | "klarna" | "afterpay" | "paypal" | "zip" | "sezzle" | "other";

export type InstallmentStatus = "upcoming" | "paid";

export interface Installment {
  dueDate: ISODate;
  amount: number;
  status: InstallmentStatus;
}

export interface Plan {
  id: string;
  provider: ProviderId;
  merchant: string;
  totalAmount: number;
  apr?: number | null;
  installments: Installment[];
  /** parsed = from a pasted email, statement = from a bank statement import. */
  source: "parsed" | "statement" | "manual";
}

export type PayFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly";

export interface Bill {
  id: string;
  name: string;
  amount: number;
  /** 1–31. Clamped to the last day of shorter months. */
  dayOfMonth: number;
  /** Rent, utilities, insurance… — protected first in rescue mode. Subscriptions are not. */
  essential: boolean;
}

export interface CashProfile {
  /** Checking balance at the start of `today`, before any of today's events. */
  balance: number;
  paycheckAmount: number;
  frequency: PayFrequency;
  nextPayday: ISODate;
  bills: Bill[];
  /** Cushion the user wants to keep; days below it are "tight". */
  buffer: number;
}

export type CashEvent =
  | { kind: "income"; date: ISODate; amount: number; label: string }
  | { kind: "bill"; date: ISODate; amount: number; label: string; billId: string; essential: boolean }
  | {
      kind: "installment";
      date: ISODate;
      amount: number;
      label: string;
      planId: string;
      provider: ProviderId;
      /** Due before `today` but still unpaid — counted on `today`. */
      overdue: boolean;
    };

export type DayStatus = "ok" | "tight" | "short";

export interface DayResult {
  date: ISODate;
  startBalance: number;
  endBalance: number;
  events: CashEvent[];
  status: DayStatus;
}
