/**
 * Runs on shopping pages. Looks for an explicit BNPL offer ("4 interest-free payments of $60"),
 * runs the same deterministic engine as the web app against the user's synced plans, and shows a
 * small verdict card. Everything happens locally; the page and the user's data are never sent anywhere.
 */
import { checkAffordability } from "../../lib/engine";
import { detectOffer, type DetectedOffer } from "../../lib/bnpl-detect";
import { localToday } from "../../lib/ui-format";
import { verdictCopy, type VerdictCopy } from "../../lib/verdict-copy";
import { APP_URL, loadSyncedState } from "./shared";

const MAX_TEXT = 200_000;
const COLORS = {
  safe: { bg: "#ecfdf5", border: "#6ee7b7", title: "#065f46", icon: "✓" },
  tight: { bg: "#fffbeb", border: "#fcd34d", title: "#78350f", icon: "!" },
  no: { bg: "#fef2f2", border: "#fca5a5", title: "#991b1b", icon: "✕" },
  setup: { bg: "#f0fdfa", border: "#5eead4", title: "#115e59", icon: "i" },
} as const;

let host: HTMLDivElement | null = null;
let shownKey: string | null = null;
let dismissedKey: string | null = null;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, style: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.setAttribute("style", style);
  if (text) node.textContent = text;
  return node;
}

function render(key: string, tone: keyof typeof COLORS, title: string, lines: string[], link: { href: string; label: string }) {
  if (key === shownKey || key === dismissedKey) return;
  shownKey = key;
  host?.remove();
  host = document.createElement("div");
  host.setAttribute("data-splitsafe", "verdict");
  const root = host.attachShadow({ mode: "closed" });
  const c = COLORS[tone];

  const card = el(
    "div",
    `position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:340px;font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;` +
      `background:${c.bg};border:2px solid ${c.border};border-radius:14px;padding:14px 16px;box-shadow:0 8px 24px rgba(15,23,42,.18);color:#0f172a`,
  );
  card.setAttribute("role", "status");
  const head = el("div", "display:flex;align-items:center;justify-content:space-between;gap:12px");
  head.append(el("span", "font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b", "SplitSafe check"));
  const close = el("button", "border:0;background:none;cursor:pointer;font-size:16px;color:#475569;padding:0 2px", "×");
  close.setAttribute("aria-label", "Dismiss SplitSafe check");
  close.addEventListener("click", () => {
    dismissedKey = key;
    host?.remove();
    host = null;
  });
  head.append(close);
  card.append(head, el("div", `margin-top:4px;font-weight:700;font-size:16px;color:${c.title}`, `${c.icon}  ${title}`));
  for (const line of lines) card.append(el("div", "margin-top:4px", line));
  const a = el("a", "display:inline-block;margin-top:8px;color:#0f766e;font-weight:600;text-decoration:underline", link.label);
  a.setAttribute("href", link.href);
  a.setAttribute("target", "_blank");
  a.setAttribute("rel", "noopener");
  card.append(a, el("div", "margin-top:6px;font-size:11px;color:#64748b", "Checked on this device. Nothing was sent anywhere."));
  root.append(card);
  document.documentElement.append(host);
}

async function check() {
  const text = (document.body?.innerText ?? "").slice(0, MAX_TEXT);
  const offer: DetectedOffer | null = detectOffer(text);
  if (!offer) {
    host?.remove();
    host = null;
    shownKey = null;
    return;
  }

  const { state } = await loadSyncedState();
  if (!state?.profile) {
    render(`setup:${offer.match}`, "setup", "Set up SplitSafe to check this", [`Found: ${offer.match}.`, "Open SplitSafe once to add your paycheck and plans."], {
      href: APP_URL,
      label: "Open SplitSafe",
    });
    return;
  }

  const today = localToday();
  const report = checkAffordability(state.profile, state.plans, offer.input, today);
  const copy: VerdictCopy = verdictCopy(offer.input, report, today, state.profile.buffer);
  const lines = [copy.detail];
  if (copy.suggestion) lines.push(`💡 ${copy.suggestion}`);
  render(`${copy.tone}:${offer.match}:${offer.input.provider}`, copy.tone, copy.title, lines, { href: APP_URL, label: "See your calendar" });
}

let timer: ReturnType<typeof setTimeout> | undefined;
const schedule = () => {
  clearTimeout(timer);
  timer = setTimeout(() => void check(), 600);
};

void check();
// Checkout pages update prices and payment options dynamically.
new MutationObserver((mutations) => {
  if (mutations.every((m) => host && host.contains(m.target as Node))) return;
  schedule();
}).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
chrome.storage.onChanged.addListener(() => {
  shownKey = null;
  schedule();
});
