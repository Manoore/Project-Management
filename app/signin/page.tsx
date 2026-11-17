import Link from "next/link";
import PasswordForm from "../password-form";
import s from "../landing.module.css";
export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const configured = Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET && process.env.MICROSOFT_TENANT_ID && !["common", "organizations", "consumers"].includes(process.env.MICROSOFT_TENANT_ID));
  return <main className={s.authPage}><Link href="/" className={s.logo}>people<span>flow</span></Link><section className={s.authCard}><p className={s.eyebrow}>WELCOME BACK</p><h1>Your next good day<br/>starts here.</h1><p>Sign in with your email and password, or use Microsoft.</p>{error && <p role="alert">Sign-in could not be completed. Please try again or contact your workspace administrator.</p>}<PasswordForm/>{configured ? <a className={s.microsoftButton} href="/api/auth/microsoft">▦ Continue with Microsoft</a> : <><button className={s.microsoftButton} disabled>▦ Continue with Microsoft</button><p role="status">Microsoft sign-in is awaiting configuration by your administrator.</p></>}<p>New to PeopleFlow? <Link href="/signup">Create your account →</Link></p><Link href="/">← Back to PeopleFlow</Link></section></main>;
}

