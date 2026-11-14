"use client";

import { useCallback, useEffect, useState } from "react";
import type { CashProfile, Plan } from "@/lib/engine";
import { appStateSchema, type AppState, type Subscription } from "@/lib/schemas";
import { STORAGE_KEY } from "@/lib/storage-key";
import { addDays } from "@/lib/engine";
import { TRIAL_DAYS } from "@/lib/pricing";
import { localToday } from "@/lib/ui-format";

export const EMPTY_STATE: AppState = {
  version: 1,
  plans: [],
  profile: null,
  isSample: false,
  asOf: null,
  checkIns: [],
  subscription: null,
};

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
    setProfile: (profile: CashProfile) => update((s) => ({ ...s, profile, asOf: localToday() })),
    replaceAll: (next: AppState) => update(() => next),
    reset: () => update(() => EMPTY_STATE),
    /** Saves a confirmed weekly check-in. */
    checkIn: (profile: CashProfile, plans: Plan[], paid: number, missed: number) =>
      update((s) => {
        const date = localToday();
        return { ...s, profile, plans, asOf: date, checkIns: [...s.checkIns, { date, paid, missed }] };
      }),
    /** Starts Plus with a free trial (test mode: no money moves). */
    startPlus: (interval: Subscription["interval"]) =>
      update((s) => {
        const since = localToday();
        return { ...s, subscription: { plan: "plus", interval, since, trialEndsAt: addDays(since, TRIAL_DAYS - 1), testMode: true } };
      }),
    cancelPlus: () => update((s) => ({ ...s, subscription: null })),
  };
}

export type AppStore = ReturnType<typeof useAppState>;

export const isPlus = (s: AppState): boolean => s.subscription !== null;

/** Plus features run for subscribers, and for everyone on the clearly labeled sample data. */
export const hasPlusAccess = (s: AppState): boolean => isPlus(s) || s.isSample;
