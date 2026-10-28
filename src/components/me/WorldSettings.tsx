"use client";

/**
 * Account settings for praying with the world: home area, which
 * notifications to get, and how (in the app, email, browser push).
 */
import { useCallback, useEffect, useState } from "react";
import AreaPicker, { areaPayload } from "../world/AreaPicker";
import { useCityIndex } from "@/hooks/useCityIndex";
import type { SettingsView } from "@/lib/apiTypes";
import { api } from "@/lib/client";
import type { Area } from "@/lib/cities";
import { disableBrowserPush, enableBrowserPush, pushSupported } from "@/lib/push";

export default function WorldSettings() {
  const index = useCityIndex();
  const [settings, setSettings] = useState<SettingsView | null>(null);
  const [home, setHome] = useState<Area | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const apply = useCallback(
    (s: SettingsView) => {
      setSettings(s);
      if (index) {
        const c = s.home?.cityId != null ? index.city(s.home.cityId) : null;
        setHome(c ? index.cityArea(c) : s.home ? index.countryArea(s.home.cc) : null);
      }
    },
    [index],
  );

  useEffect(() => {
    api<SettingsView>("/api/me/settings")
      .then(apply)
      .catch(() => {});
  }, [apply]);

  async function save(changes: Partial<Record<"notifyRequests" | "notifyArea" | "email" | "push", boolean>> & { home?: unknown }) {
    setMessage(null);
    try {
      apply(await api<SettingsView>("/api/me/settings", { method: "PUT", body: changes }));
      setMessage("Saved.");
    } catch {
      setMessage("Couldn't save just now.");
    }
  }

  async function togglePush(on: boolean) {
    if (!settings) return;
    if (on) {
      if (!settings.available.vapidPublicKey) return;
      const result = await enableBrowserPush(settings.available.vapidPublicKey).catch(() => "unsupported" as const);
      if (result === "denied") return setMessage("Notifications are blocked for this site in your browser settings.");
      if (result === "unsupported") return setMessage("This browser doesn't support push notifications.");
      await save({ push: true });
    } else {
      await disableBrowserPush();
      await save({ push: false });
    }
  }

  if (!settings) return <p className="muted">Loading…</p>;

  return (
    <div className="stack">
      <AreaPicker
        value={home}
        label="Your area (city or country, never your exact location)"
        onChange={(a) => {
          setHome(a);
          save({ home: a ? areaPayload(a) : null });
        }}
      />
      <p className="hint">Used for your prayer requests and for &quot;Prayers for your area&quot;.</p>

      <fieldset className="settings-group">
        <legend>Tell me when…</legend>
        <label className="toggle">
          <input type="checkbox" checked={settings.notifyRequests} onChange={(e) => save({ notifyRequests: e.target.checked })} />
          Someone prays for one of my prayer requests
        </label>
        <label className="toggle">
          <input type="checkbox" checked={settings.notifyArea} onChange={(e) => save({ notifyArea: e.target.checked })} disabled={!home || home.kind !== "city"} />
          Someone sends a prayer to my city {(!home || home.kind !== "city") && <small className="muted">(choose a city above)</small>}
        </label>
      </fieldset>

      <fieldset className="settings-group">
        <legend>How</legend>
        <label className="toggle">
          <input type="checkbox" checked disabled /> In the app (the bell at the top)
        </label>
        <label className="toggle">
          <input type="checkbox" checked={settings.email} onChange={(e) => save({ email: e.target.checked })} disabled={!settings.available.email} />
          By email (at most one an hour) {!settings.available.email && <small className="muted">(not set up on this server yet)</small>}
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.push}
            onChange={(e) => togglePush(e.target.checked)}
            disabled={!settings.available.webPush || !pushSupported()}
          />
          Browser notifications {!settings.available.webPush && <small className="muted">(not set up on this server yet)</small>}
        </label>
      </fieldset>
      {message && <p className="form-message">{message}</p>}
    </div>
  );
}
