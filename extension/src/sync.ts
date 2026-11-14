/**
 * Runs only on the SplitSafe site. Copies the app's localStorage state into the extension's own
 * storage so checkout pages can be checked. Data moves between two places on this device only.
 */
import { STORAGE_KEY } from "../../lib/storage-key";
import { EXT_STATE_KEY, EXT_SYNCED_AT_KEY } from "./keys";

let last: string | null = null;

function sync() {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return;
  }
  if (raw === null || raw === last) return;
  last = raw;
  void chrome.storage.local.set({ [EXT_STATE_KEY]: raw, [EXT_SYNCED_AT_KEY]: Date.now() });
}

sync();
// The app writes to localStorage as the user edits; pick up changes while the tab is open.
setInterval(sync, 2000);
document.addEventListener("visibilitychange", sync);
