import type { ProviderId } from "./types";

/**
 * Provider rules used for rescue-mode prioritization and the provider notes in the UI.
 *
 * `verified: false` means we could not confirm the rule and the UI says so. Rules change often;
 * every entry carries the page to check and the date it was last reviewed.
 */
export interface ProviderRule {
  id: ProviderId;
  name: string;
  lateFee: {
    /** null = unknown */
    charges: boolean | null;
    description: string;
  };
  reportsToCreditBureaus: {
    /** null = unknown */
    value: boolean | null;
    description: string;
  };
  hardshipOptions: string[];
  sourceUrl: string;
  lastVerified: string;
  verified: boolean;
}

export const PROVIDERS: Record<ProviderId, ProviderRule> = {
  affirm: {
    id: "affirm",
    name: "Affirm",
    lateFee: { charges: false, description: "No late fees." },
    reportsToCreditBureaus: {
      value: true,
      description: "Reports to Experian and TransUnion, so missed payments can affect your credit.",
    },
    hardshipOptions: ["Contact support to discuss a payment arrangement", "Change your payment date in the app (where offered)"],
    sourceUrl: "https://www.affirm.com/how-it-works",
    lastVerified: "2026-11-14",
    verified: true,
  },
  klarna: {
    id: "klarna",
    name: "Klarna",
    lateFee: { charges: true, description: "Late fee of up to ~$7 on Pay in 4." },
    reportsToCreditBureaus: { value: true, description: "Reports to TransUnion." },
    hardshipOptions: ["Payment extension on request (in the app)", "Contact customer service about hardship"],
    sourceUrl: "https://www.klarna.com/us/customer-service/",
    lastVerified: "2026-11-14",
    verified: true,
  },
  afterpay: {
    id: "afterpay",
    name: "Afterpay",
    lateFee: { charges: true, description: "Late fee of up to ~$8, capped at 25% of the order value." },
    reportsToCreditBureaus: { value: false, description: "Does not report to credit bureaus." },
    hardshipOptions: ["Hardship program — contact support", "Ask for a payment date change"],
    sourceUrl: "https://help.afterpay.com/",
    lastVerified: "2026-11-14",
    verified: true,
  },
  paypal: {
    id: "paypal",
    name: "PayPal Pay in 4",
    lateFee: { charges: null, description: "Unverified — check your Pay in 4 agreement." },
    reportsToCreditBureaus: { value: null, description: "Unverified — check PayPal's current terms." },
    hardshipOptions: ["Contact PayPal customer service"],
    sourceUrl: "https://www.paypal.com/us/digital-wallet/ways-to-pay/buy-now-pay-later",
    lastVerified: "2026-11-14",
    verified: false,
  },
  zip: {
    id: "zip",
    name: "Zip",
    lateFee: { charges: null, description: "Unverified — late fees may vary by state." },
    reportsToCreditBureaus: { value: null, description: "Unverified — check Zip's current terms." },
    hardshipOptions: ["Contact Zip support"],
    sourceUrl: "https://zip.co/us",
    lastVerified: "2026-11-14",
    verified: false,
  },
  sezzle: {
    id: "sezzle",
    name: "Sezzle",
    lateFee: { charges: null, description: "Unverified — check Sezzle's current fee schedule." },
    reportsToCreditBureaus: { value: null, description: "Unverified — reporting may depend on the product." },
    hardshipOptions: ["Reschedule a payment in the app (may carry a fee)", "Contact Sezzle support"],
    sourceUrl: "https://sezzle.com/",
    lastVerified: "2026-11-14",
    verified: false,
  },
  other: {
    id: "other",
    name: "Other",
    lateFee: { charges: null, description: "Unknown — check your agreement." },
    reportsToCreditBureaus: { value: null, description: "Unknown — check your agreement." },
    hardshipOptions: ["Contact the lender's support team"],
    sourceUrl: "",
    lastVerified: "2026-11-14",
    verified: false,
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export const providerName = (id: ProviderId): string => PROVIDERS[id]?.name ?? "Other";

/** Map free text ("Klarna Inc.", "PayPal Pay in 4", "afterpay") to a provider id. */
export function normalizeProvider(raw: string | null | undefined): ProviderId {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("affirm")) return "affirm";
  if (s.includes("klarna")) return "klarna";
  if (s.includes("afterpay") || s.includes("clearpay")) return "afterpay";
  if (s.includes("paypal")) return "paypal";
  if (s.includes("sezzle")) return "sezzle";
  if (/\bzip\b/.test(s) || s.includes("quadpay")) return "zip";
  return "other";
}
