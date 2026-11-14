import { appStateSchema, type AppState } from "../../lib/schemas";
import { EXT_STATE_KEY, EXT_SYNCED_AT_KEY } from "./keys";

export const APP_URL = "https://splitsafe-phi.vercel.app/app";

export async function loadSyncedState(): Promise<{ state: AppState | null; syncedAt: number | null }> {
  const stored = await chrome.storage.local.get([EXT_STATE_KEY, EXT_SYNCED_AT_KEY]);
  const raw = stored[EXT_STATE_KEY];
  if (typeof raw !== "string") return { state: null, syncedAt: null };
  try {
    const parsed = appStateSchema.safeParse(JSON.parse(raw));
    return { state: parsed.success ? parsed.data : null, syncedAt: (stored[EXT_SYNCED_AT_KEY] as number) ?? null };
  } catch {
    return { state: null, syncedAt: null };
  }
}
