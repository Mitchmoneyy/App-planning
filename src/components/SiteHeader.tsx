"use client";

/** Header for pages outside the globe (account, sign-in, about…). */
import Link from "next/link";
import { useMe } from "./MeProvider";
import NotificationBell from "./NotificationBell";
import { ThemeToggle } from "./ThemeProvider";

export default function SiteHeader({ dark = false }: { dark?: boolean }) {
  const { me } = useMe();
  return (
    <header className={`site-header${dark ? " is-dark" : ""}`}>
      <Link href="/" className="site-header__brand">
        <span aria-hidden="true">✦</span> Global Sanctuary
      </Link>
      <nav className="site-header__nav" aria-label="Main">
        <Link href="/">Globe</Link>
        <Link href="/world">Pray for the world</Link>
        <Link href="/me">{me?.user ? me.user.displayName : "My sanctuary"}</Link>
        <ThemeToggle className="site-header__icon" />
        <NotificationBell />
      </nav>
      {me && !me.storage.persistent && <p className="demo-banner">Demo mode: prayers and accounts are stored temporarily on this server.</p>}
    </header>
  );
}
