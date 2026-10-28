"use client";

/** Sign in / create account. Accounts are optional: everything works anonymously. */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useMe } from "./MeProvider";
import { api, ApiError } from "@/lib/client";

export default function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useMe();
  const [mode, setMode] = useState<"signin" | "signup">(params.get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only allow redirects within this site.
  const next = params.get("next");
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/me";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/auth/${mode}`, { body: mode === "signup" ? { email, password, displayName } : { email, password } });
      await refresh();
      router.push(target);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="card auth-card">
      <h1>{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
      <p className="muted">
        An account keeps your saved places and prayer history across devices, and lets you write reviews. You can always pray
        without one.
      </p>

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mode === "signin"} className={mode === "signin" ? "is-on" : ""} onClick={() => setMode("signin")}>
          Sign in
        </button>
        <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "is-on" : ""} onClick={() => setMode("signup")}>
          Create account
        </button>
      </div>

      <form onSubmit={submit} className="stack">
        {mode === "signup" && (
          <label className="field">
            <span>Your name</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} autoComplete="given-name" required />
            <small>Shown on your reviews, and on prayers you choose to sign.</small>
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            minLength={mode === "signup" ? 8 : undefined}
            required
          />
          {mode === "signup" && <small>At least 8 characters.</small>}
        </label>
        {error && (
          <p className="form-message is-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="primary-button" disabled={busy}>
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>
      <p className="hint">
        Anything you did on this device before signing in (saved places, prayers, candles) moves to your account. See our{" "}
        <Link href="/privacy">privacy notes</Link>.
      </p>
    </div>
  );
}
