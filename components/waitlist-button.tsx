"use client";

import { useState } from "react";
import { Button, Field, Input, Modal } from "./ui";

const KEY = "splitsafe:waitlist";

/** Placeholder for Plus. The email is kept only in this browser's localStorage — we say so in the UI. */
export function WaitlistButton() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  const submit = () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) return;
    try {
      window.localStorage.setItem(KEY, email);
    } catch {
      // Storage unavailable — nothing else to do; the message below stays accurate.
    }
    setDone(true);
  };

  return (
    <>
      <Button size="lg" className="w-full" onClick={() => setOpen(true)}>
        Join the Plus waitlist
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="SplitSafe Plus is coming soon">
        {done ? (
          <p className="text-sm text-slate-700">
            Thanks! For this demo, your email is saved only in this browser (localStorage) — it isn&apos;t sent to us or anyone else.
          </p>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <p className="text-sm text-slate-700">
              Plus adds unlimited “Can I afford this?” checks, danger-day alerts and a weekly forecast. Leave your email to hear when it launches.
            </p>
            <Field label="Email" hint="Demo only: stored in this browser's localStorage, never sent to a server.">
              {(id) => <Input id={id} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />}
            </Field>
            <Button type="submit">Notify me</Button>
          </form>
        )}
      </Modal>
    </>
  );
}
