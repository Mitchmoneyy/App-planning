"use client";

/** One prayer request, the prayers sent for it, and (for its author) controls. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useGlobe } from "../globe/GlobeContext";
import { RequestCard, WorldPrayerItem } from "./WorldItems";
import type { RequestView, WorldPrayerView } from "@/lib/apiTypes";
import { api, ApiError } from "@/lib/client";

export default function RequestPanel({ id }: { id: string }) {
  const router = useRouter();
  const { api: globe, setPick } = useGlobe();
  const [request, setRequest] = useState<RequestView | null>(null);
  const [prayers, setPrayers] = useState<WorldPrayerView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<{ request: RequestView; prayers: WorldPrayerView[] }>(`/api/world/requests/${id}`);
      setRequest(res.request);
      setPrayers(res.prayers);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load this request.");
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    load();
  }, [load]);

  // Glide the globe to the request's area and mark it.
  useEffect(() => {
    if (!request) return;
    setPick({ lat: request.area.lat, lon: request.area.lon, label: request.area.name });
    globe?.flyTo(request.area.lat, request.area.lon, 1.2, 1800);
    return () => setPick(null);
  }, [request, globe, setPick]);

  async function update(changes: { closed?: boolean; visibility?: "public" | "unlisted" }) {
    await api(`/api/world/requests/${id}`, { method: "PATCH", body: changes });
    load();
  }

  async function remove() {
    if (!confirm("Delete this request? The prayers sent for it stay with the people who sent them.")) return;
    await api(`/api/world/requests/${id}`, { method: "DELETE", body: {} });
    router.push("/me");
  }

  return (
    <aside className="side-panel panel-glass" aria-label="Prayer request">
      <header className="side-panel__head">
        <Link href="/world?tab=requests" className="close-x" aria-label="Close">
          ×
        </Link>
        <p className="eyebrow">Prayer request</p>
        <h1>{request ? `From ${request.area.kind === "city" ? request.area.name : request.area.country}` : "Prayer request"}</h1>
      </header>
      <div className="side-panel__scroll">
        {error && <p className="form-message is-error">{error}</p>}
        {request && (
          <>
            <ul className="req-list">
              <RequestCard request={request} onChange={setRequest} />
            </ul>

            {request.mine && (
              <div className="owner-tools">
                {request.status !== "published" && <p className="notice">This request is waiting for a quick review before others can see it.</p>}
                <p className="link-row">
                  <button
                    type="button"
                    className="secondary-button small"
                    onClick={async () => {
                      await navigator.clipboard?.writeText(window.location.href).catch(() => {});
                      setCopied(true);
                    }}
                  >
                    {copied ? "Link copied" : "Copy link to share"}
                  </button>
                  <button type="button" className="secondary-button small" onClick={() => update({ visibility: request.visibility === "public" ? "unlisted" : "public" })}>
                    {request.visibility === "public" ? "Hide from the globe" : "Show on the globe"}
                  </button>
                  <button type="button" className="secondary-button small" onClick={() => update({ closed: !request.closed })}>
                    {request.closed ? "Reopen" : "Close request"}
                  </button>
                  <button type="button" className="danger-button small" onClick={remove}>
                    Delete
                  </button>
                </p>
              </div>
            )}

            <h2 className="section-title">
              {prayers.length > 0 ? `Prayers sent (${prayers.length})` : "No prayers yet"}
            </h2>
            <ul className="wp-list">
              {prayers.map((p) => (
                <WorldPrayerItem key={p.id} prayer={p} onHidden={() => setPrayers((l) => l.filter((x) => x.id !== p.id))} />
              ))}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}
