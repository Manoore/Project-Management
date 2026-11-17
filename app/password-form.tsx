"use client";
import { useState } from "react";
import s from "./landing.module.css";
export default function PasswordForm({ signup = false }: { signup?: boolean }) {
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  return <form className={s.passwordForm} onSubmit={async event => { event.preventDefault(); setError(""); setBusy(true); const data = new FormData(event.currentTarget); try { const response = await fetch("/api/auth/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: data.get("name"), email: data.get("email"), password: data.get("password"), mode: signup ? "signup" : "signin" }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Sign-in failed"); window.location.assign("/workspace"); } catch (e) { setError((e as Error).message); setBusy(false); } }}>{signup && <label>Full name<input name="name" autoComplete="name" required minLength={2} maxLength={80}/></label>}<label>Email address<input name="email" type="email" autoComplete="username" required maxLength={254}/></label><label>Password<input name="password" type="password" autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? 12 : 1} maxLength={128} required/></label>{signup && <small>Use at least 12 characters. New accounts receive member access.</small>}{error && <p role="alert">{error}</p>}<button className={s.microsoftButton} disabled={busy} type="submit">{busy ? "Please wait…" : signup ? "Create account" : "Sign in"}</button></form>;
}

