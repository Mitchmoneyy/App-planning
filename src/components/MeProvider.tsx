"use client";

/**
 * Shares "who am I" (anonymous or signed in), saved places, and storage status
 * with every page, and offers save/unsave helpers.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { MeView } from "@/lib/apiTypes";
import { api } from "@/lib/client";

interface MeContext {
  me: MeView | null;
  loading: boolean;
  refresh(): Promise<void>;
  isFavorite(placeId: string): boolean;
  setFavorite(placeId: string, on: boolean): Promise<void>;
}

const Ctx = createContext<MeContext | null>(null);

export function MeProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<MeView | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setMe(await api<MeView>("/api/me"));
    } catch {
      // Offline or server error: keep whatever we had.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const setFavorite = useCallback(async (placeId: string, on: boolean) => {
    // Update the UI right away, then confirm with the server.
    setMe((m) => (m ? { ...m, favorites: on ? [placeId, ...m.favorites.filter((f) => f !== placeId)] : m.favorites.filter((f) => f !== placeId) } : m));
    try {
      await api(`/api/me/favorites/${encodeURIComponent(placeId)}`, { method: on ? "PUT" : "DELETE", body: {} });
    } catch {
      setMe((m) => (m ? { ...m, favorites: on ? m.favorites.filter((f) => f !== placeId) : [placeId, ...m.favorites] } : m));
    }
  }, []);

  // Inside the phone app: the native shell hands us its push token
  // (window.__gsSetExpoToken). Register it once someone is signed in.
  const [expoToken, setExpoToken] = useState<string | null>(null);
  useEffect(() => {
    const w = window as unknown as { __gsSetExpoToken?: (t: string) => void };
    w.__gsSetExpoToken = (t: string) => {
      try {
        sessionStorage.setItem("gs-expo-token", t);
      } catch {
        // ignore
      }
      setExpoToken(t);
    };
    try {
      const saved = sessionStorage.getItem("gs-expo-token");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore after a page load inside the app
      if (saved) setExpoToken(saved);
    } catch {
      // ignore
    }
    return () => {
      delete w.__gsSetExpoToken;
    };
  }, []);
  const userId = me?.user?.id;
  useEffect(() => {
    if (userId && expoToken) api("/api/me/push", { body: { kind: "expo", token: expoToken } }).catch(() => {});
  }, [userId, expoToken]);

  const value = useMemo<MeContext>(
    () => ({ me, loading, refresh, setFavorite, isFavorite: (id) => me?.favorites.includes(id) ?? false }),
    [me, loading, refresh, setFavorite],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMe() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMe must be used inside <MeProvider>");
  return ctx;
}
