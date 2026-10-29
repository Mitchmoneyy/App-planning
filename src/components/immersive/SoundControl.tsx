"use client";

/** Ambient sound toggle: muted by default, with a choice of sounds suited to the place. */
import { useEffect, useRef, useState } from "react";
import { AMBIENCE_LABELS, AmbiencePlayer, ambienceFor, type AmbienceKind } from "@/lib/ambience";

export default function SoundControl({ faith }: { faith: string }) {
  const options = ambienceFor(faith);
  const player = useRef<AmbiencePlayer | null>(null);
  const [on, setOn] = useState(false);
  const [kind, setKind] = useState<AmbienceKind>(options.includes("bells") ? "bells" : options[options.length - 1]);
  const [menu, setMenu] = useState(false);

  useEffect(() => () => player.current?.dispose(), []);

  async function start(k: AmbienceKind) {
    player.current ??= new AmbiencePlayer();
    await player.current.play(k);
    setOn(true);
  }

  function toggle() {
    if (on) {
      player.current?.stop();
      setOn(false);
    } else {
      start(kind);
    }
  }

  return (
    <div className="sound">
      <button type="button" className={`glass-pill${on ? " is-on" : ""}`} onClick={toggle} aria-pressed={on} title={on ? "Mute ambient sound" : "Play ambient sound"}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
          {on ? (
            <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          ) : (
            <path d="M16 9.5l5 5M21 9.5l-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          )}
        </svg>
        <span className="sound__label">{on ? AMBIENCE_LABELS[kind] : "Sound off"}</span>
      </button>
      {options.length > 1 && (
        <button type="button" className="glass-pill glass-pill--icon" onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-label="Choose sound">
          ▾
        </button>
      )}
      {menu && (
        <ul className="sound__menu panel-glass">
          {options.map((o) => (
            <li key={o}>
              <button
                type="button"
                className={o === kind ? "is-on" : ""}
                onClick={() => {
                  setKind(o);
                  setMenu(false);
                  start(o);
                }}
              >
                {AMBIENCE_LABELS[o]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
