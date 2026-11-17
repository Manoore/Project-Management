import Link from "next/link";
import PasswordForm from "../password-form";
import s from "../landing.module.css";
export default function SignUp() {
  const configured = Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET && process.env.MICROSOFT_TENANT_ID && !["common", "organizations", "consumers"].includes(process.env.MICROSOFT_TENANT_ID));
  return <main className={s.authPage}><Link href="/" className={s.logo}>people<span>flow</span></Link><section className={s.authCard}><p className={s.eyebrow}>MAKE SPACE FOR GOOD WORK</p><h1>A place for you.<br/>A flow for your team.</h1><p>Create an account with your email and password. Projects must be shared with you.</p><PasswordForm signup/>{configured ? <a className={s.microsoftButton} href="/api/auth/microsoft?mode=signup">▦ Sign up with Microsoft</a> : <><button className={s.microsoftButton} disabled>▦ Sign up with Microsoft</button><p role="status">Microsoft sign-up is available once your administrator configures it.</p></>}<p>Already have an account? <Link href="/signin">Sign in →</Link></p><Link href="/">← Back to PeopleFlow</Link></section></main>;
}

