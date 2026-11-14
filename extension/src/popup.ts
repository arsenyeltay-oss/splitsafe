import { debtSummary, nextDangerDay, simulate } from "../../lib/engine";
import { formatDate, formatMoney, localToday } from "../../lib/ui-format";
import { APP_URL, loadSyncedState } from "./shared";

async function main() {
  const status = document.getElementById("status")!;
  const { state, syncedAt } = await loadSyncedState();
  if (!state?.profile) {
    status.textContent = "Not set up yet. Open SplitSafe and add your paycheck and plans — the extension syncs them automatically.";
    return;
  }
  const today = localToday();
  const danger = nextDangerDay(simulate(state.profile, state.plans, today), state.profile.buffer);
  const debt = debtSummary(state.plans);
  const lines = [
    `${state.plans.length} plan${state.plans.length === 1 ? "" : "s"} · ${formatMoney(debt.totalOutstanding)} left to pay`,
    danger
      ? `Next danger day: ${formatDate(danger.date, today)} (${danger.status === "short" ? `short ${formatMoney(danger.gap)}` : "tight"})`
      : "No danger days in the next 90 days",
    syncedAt ? `Synced ${new Date(syncedAt).toLocaleString()}` : "",
  ].filter(Boolean);
  status.replaceChildren(...lines.map((l) => Object.assign(document.createElement("p"), { textContent: l })));
}

document.getElementById("open")!.addEventListener("click", () => void chrome.tabs.create({ url: APP_URL }));
void main();
