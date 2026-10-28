"use client";

/** People you've blocked (described by where you saw them, never by identity), with unblock. */
import { useEffect, useState } from "react";
import type { BlockView } from "@/lib/apiTypes";
import { api, timeAgo } from "@/lib/client";

export default function BlockedList() {
  const [blocks, setBlocks] = useState<BlockView[] | null>(null);

  useEffect(() => {
    api<{ blocks: BlockView[] }>("/api/blocks")
      .then((r) => setBlocks(r.blocks))
      .catch(() => setBlocks([]));
  }, []);

  if (!blocks) return null;
  if (blocks.length === 0) return <p className="muted">You haven&apos;t blocked anyone. Use the ⋯ menu on any prayer to report it or block its author.</p>;

  return (
    <ul className="history-list">
      {blocks.map((b) => (
        <li key={b.id} className="blocked-row">
          <span>
            {b.label} <span className="muted">· blocked {timeAgo(b.createdAt)}</span>
          </span>
          <button
            type="button"
            className="link-button"
            onClick={async () => {
              await api(`/api/blocks/${b.id}`, { method: "DELETE", body: {} }).catch(() => {});
              setBlocks((list) => list?.filter((x) => x.id !== b.id) ?? null);
            }}
          >
            Unblock
          </button>
        </li>
      ))}
    </ul>
  );
}
