import { z } from "zod";
import { isValidISODate, PROVIDER_IDS } from "@/lib/engine";
import type { ProviderId } from "@/lib/engine";

export const isoDate = z.string().refine(isValidISODate, "Expected a date like 2026-11-20");
const money = z.number().finite().nonnegative();

export const installmentSchema = z.object({
  dueDate: isoDate,
  amount: money,
  status: z.enum(["upcoming", "paid"]),
});

export const planSchema = z.object({
  id: z.string().min(1),
  provider: z.enum(PROVIDER_IDS as [ProviderId, ...ProviderId[]]),
  merchant: z.string(),
  totalAmount: money,
  apr: z.number().finite().min(0).max(100).nullable().optional(),
  installments: z.array(installmentSchema),
  source: z.enum(["parsed", "manual"]),
});

export const billSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  amount: money,
  dayOfMonth: z.number().int().min(1).max(31),
  essential: z.boolean().default(true),
});

export const cashProfileSchema = z.object({
  balance: z.number().finite(),
  paycheckAmount: money,
  frequency: z.enum(["weekly", "biweekly", "semimonthly", "monthly"]),
  nextPayday: isoDate,
  bills: z.array(billSchema),
  buffer: money,
});

export const appStateSchema = z.object({
  version: z.literal(1),
  plans: z.array(planSchema),
  profile: cashProfileSchema.nullable(),
  isSample: z.boolean(),
});

export type AppState = z.infer<typeof appStateSchema>;
