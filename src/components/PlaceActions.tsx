"use client";

/** Under the place title: "Pray here", save, and live candle/prayer counts. */
import Link from "next/link";
import FavoriteButton from "./FavoriteButton";
import { usePlaceStats } from "@/hooks/usePlaceStats";

export default function PlaceActions({ placeId }: { placeId: string }) {
  const { stats } = usePlaceStats(placeId);
  return (
    <div className="place-actions">
      <div className="place-actions__buttons">
        <Link href={`/place/${placeId}/pray`} className="primary-button">
          <span aria-hidden="true">🕯</span> Pray here
        </Link>
        <FavoriteButton placeId={placeId} />
      </div>
      <p className="place-actions__stats" aria-live="polite">
        {stats ? (
          <>
            <strong>{stats.candles.toLocaleString()}</strong> candle{stats.candles === 1 ? "" : "s"} lit ·{" "}
            <strong>{stats.prayers.toLocaleString()}</strong> prayer{stats.prayers === 1 ? "" : "s"} offered
          </>
        ) : (
          " "
        )}
      </p>
    </div>
  );
}
