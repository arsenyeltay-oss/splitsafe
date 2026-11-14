"use client";

import { useCallback, useEffect, useState } from "react";
import type { CashProfile, Plan } from "@/lib/engine";
import { appStateSchema, type AppState } from "@/lib/schemas";

const STORAGE_KEY = "splitsafe:v1";
export const EMPTY_STATE: AppState = { version: 1, plans: [], profile: null, isSample: false };

function load(): AppState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = appStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : EMPTY_STATE;
  } catch {
    return EMPTY_STATE;
  }
}

function save(state: AppState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked (private mode): the app still works for this session.
  }
}

/**
 * All user data lives in this browser's localStorage — never on a server.
 * `ready` is false until the first client-side load, so pages render nothing data-dependent on the server.
 */
export function useAppState() {
  const [state, setState] = useState<AppState>(EMPTY_STATE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(load());
    setReady(true);
  }, []);

  const update = useCallback((fn: (s: AppState) => AppState) => {
    setState((prev) => {
      const next = fn(prev);
      save(next);
      return next;
    });
  }, []);

  return {
    state,
    ready,
    setPlans: (plans: Plan[]) => update((s) => ({ ...s, plans })),
    addPlans: (plans: Plan[]) => update((s) => ({ ...s, plans: [...s.plans, ...plans] })),
    upsertPlan: (plan: Plan) =>
      update((s) => ({
        ...s,
        plans: s.plans.some((p) => p.id === plan.id) ? s.plans.map((p) => (p.id === plan.id ? plan : p)) : [...s.plans, plan],
      })),
    deletePlan: (id: string) => update((s) => ({ ...s, plans: s.plans.filter((p) => p.id !== id) })),
    setProfile: (profile: CashProfile) => update((s) => ({ ...s, profile })),
    replaceAll: (next: AppState) => update(() => next),
    reset: () => update(() => EMPTY_STATE),
  };
}

export type AppStore = ReturnType<typeof useAppState>;
