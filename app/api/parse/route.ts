import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isValidISODate } from "@/lib/engine";
import { llmOutputSchema, llmPlanToDraft, type LlmOutput } from "@/lib/parse/normalize";
import { rateLimit } from "@/lib/parse/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CHARS = 20_000;
const DEFAULT_MODEL = "claude-opus-5-5";
/** Models that accept server-side refusal fallbacks. */
const FALLBACK_CAPABLE = /^claude-(opus-5|fable-5|sonnet-5-5)/;

const requestSchema = z.object({
  text: z.string().trim().min(1, "Paste at least one email.").max(MAX_CHARS, `Please paste at most ${MAX_CHARS.toLocaleString()} characters.`),
  today: z.string().refine(isValidISODate),
});

const SYSTEM_PROMPT = `You extract Buy Now, Pay Later (BNPL) plans from pasted confirmation emails or receipts (Klarna, Affirm, Afterpay, PayPal Pay in 4, Zip, Sezzle, or others). The text may contain several emails; return one plan per purchase.

Rules:
- Copy only what the text states. If a value is not stated, return null and add the field name to missingFields. Never estimate or invent dates or amounts.
- Dates must be ISO "YYYY-MM-DD". If an email shows a date without a year, infer the year from the email's own date or the reference date given, and set confidence to "medium".
- provider: the BNPL company (e.g. "Klarna"), not the merchant. merchant: the store.
- totalAmount: the purchase/loan amount (not including interest). apr: the stated APR as a percent number (15 for 15%), or null if not stated; 0 only if the text says 0% / interest-free.
- installments: list every payment that the text gives an explicit date for. status "paid" only if the text says that payment was paid or charged already (e.g. "charged today", "paid"); otherwise "upcoming".
- If the text gives a rule instead of dates (e.g. "4 payments of $25 every 2 weeks starting Nov 20", or "6 monthly payments, first due Dec 18"), fill scheduleRule (count, amount per payment if stated, intervalDays or intervalMonths, firstDueDate) and include in installments only the payments with explicit dates. Code will expand the rule. Set scheduleRule to null when every payment is listed explicitly.
- If a payment was charged at purchase and the remaining payments follow a rule, put the charged payment in installments (status "paid") and describe only the remaining payments in scheduleRule.
- confidence: "high" when everything was explicit, "medium" when you inferred a year or format, "low" when the text is ambiguous.
- If the text contains no BNPL plan, return {"plans": []}.`;

function errorResponse(status: number, error: string, headers?: HeadersInit) {
  return NextResponse.json({ error }, { status, headers });
}

async function extract(client: Anthropic, model: string, text: string, today: string): Promise<LlmOutput | null> {
  const useFallbacks = FALLBACK_CAPABLE.test(model);
  const response = await client.beta.messages.parse({
    model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: { effort: "low", format: betaZodOutputFormat(llmOutputSchema) },
    ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    messages: [
      {
        role: "user",
        content: `Reference date (today): ${today}\n\n<pasted_text>\n${text}\n</pasted_text>`,
      },
    ],
  });
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return null;
  const checked = llmOutputSchema.safeParse(response.parsed_output);
  return checked.success ? checked.data : null;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = rateLimit(ip, 10, 10 * 60_000);
  if (!limit.ok) {
    return errorResponse(429, "You've parsed a lot of emails in a short time. Please wait a few minutes, or add plans manually.", {
      "Retry-After": String(limit.retryAfterSec),
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "Invalid request.");
  }
  const input = requestSchema.safeParse(body);
  if (!input.success) return errorResponse(400, input.error.issues[0]?.message ?? "Invalid request.");

  if (!process.env.ANTHROPIC_API_KEY) {
    return errorResponse(503, "Email parsing isn't configured on this server. You can still add plans manually.");
  }

  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  try {
    // Validate with zod; if the output doesn't validate, retry once before giving up.
    const output = (await extract(client, model, input.data.text, input.data.today)) ??
      (await extract(client, model, input.data.text, input.data.today));
    if (!output) {
      return errorResponse(422, "We couldn't read plans from that text. Try pasting one email at a time, or add the plan manually.");
    }
    const drafts = output.plans.map((p, i) => llmPlanToDraft(p, `parsed-${Date.now()}-${i}`));
    return NextResponse.json({ plans: drafts });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return errorResponse(429, "Our parser is busy right now. Please try again in a minute, or add plans manually.");
    }
    if (err instanceof Anthropic.APIError) {
      console.error("parse: Anthropic API error", err.status);
      return errorResponse(502, "The parser hit an error. Please try again, or add plans manually.");
    }
    console.error("parse: unexpected error", err instanceof Error ? err.message : "unknown");
    return errorResponse(500, "Something went wrong while reading your emails. Please add plans manually.");
  }
}
