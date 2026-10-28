"use client";

/** A quiet first-visit hint on the home screen. Remembered once dismissed. */
import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "gs-welcome-dismissed";

export default function HomeWelcome() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser storage after mount
      setShow(!localStorage.getItem(KEY));
    } catch {
      setShow(true);
    }
  }, []);

  if (!show) return null;
  const close = () => {
    setShow(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // ignore
    }
  };

  return (
    <aside className="welcome panel-glass" aria-label="Welcome">
      <button type="button" className="icon-button welcome__close" onClick={close} aria-label="Dismiss">
        ×
      </button>
      <p className="eyebrow">Welcome</p>
      <h2>A sanctuary for the whole world</h2>
      <ul>
        <li>
          <span aria-hidden="true">✦</span> Zoom from space down to the street to find places of worship of every faith.
        </li>
        <li>
          <span aria-hidden="true">✦</span> Pray there in the way of its tradition: a candle, a diya, flowers, incense, dua or a simple prayer.
        </li>
        <li>
          <span aria-hidden="true">✧</span> <Link href="/world">Send a prayer or blessing</Link> to any city, and see the prayers travelling.
        </li>
      </ul>
      <p className="hint">Every faith is welcome here.</p>
    </aside>
  );
}
