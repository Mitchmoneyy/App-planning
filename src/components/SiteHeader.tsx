"use client";

/** Slim header for every page except the globe. */
import Link from "next/link";
import { useMe } from "./MeProvider";

export default function SiteHeader({ dark = false }: { dark?: boolean }) {
  const { me } = useMe();
  return (
    <header className={`site-header${dark ? " is-dark" : ""}`}>
      <Link href="/" className="site-header__brand">
        <span aria-hidden="true">✦</span> Global Sanctuary
      </Link>
      <nav className="site-header__nav" aria-label="Main">
        <Link href="/">Globe</Link>
        <Link href="/me">{me?.user ? me.user.displayName : "My sanctuary"}</Link>
      </nav>
      {me && !me.storage.persistent && (
        <p className="demo-banner">Demo mode: prayers and accounts are stored temporarily on this server.</p>
      )}
    </header>
  );
}
