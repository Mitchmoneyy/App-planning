"use client";

/** Estimated cost of getting to this place from where the user is now. */
import { useMemo, useState } from "react";
import { useUserLocation } from "@/hooks/useUserLocation";
import { formatDistance } from "@/lib/geo";
import { estimateTrip, formatRange, formatUsd } from "@/lib/travel";
import type { Place } from "@/lib/types";

const BOOKING_AFFILIATE = process.env.NEXT_PUBLIC_BOOKING_AFFILIATE_ID;

export default function TravelEstimate({ place }: { place: Place }) {
  const { status, location, request } = useUserLocation({ auto: false });
  const estimate = useMemo(() => (location ? estimateTrip(location, place, place.country) : null), [location, place]);
  const [nights, setNights] = useState<number | null>(null);

  const where = [place.city, place.country].filter(Boolean).join(", ");
  const dest = `${place.lat},${place.lon}`;
  const origin = location ? `${location.lat},${location.lon}` : "";
  const links = {
    flights: `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights to ${place.city ?? place.name}`)}`,
    hotels: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(where || place.name)}${BOOKING_AFFILIATE ? `&aid=${encodeURIComponent(BOOKING_AFFILIATE)}` : ""}`,
    driving: `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=driving`,
    transit: `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=transit`,
  };

  if (!estimate) {
    return (
      <section className="card travel" aria-labelledby="travel-heading">
        <h2 id="travel-heading">Plan a visit</h2>
        <p className="muted">See a rough cost to travel here from where you are.</p>
        <button type="button" className="secondary-button" onClick={request} disabled={status === "locating"}>
          {status === "locating" ? "Finding you…" : "Use my location"}
        </button>
        {status === "denied" && <p className="hint">Location is turned off for this site. You can still search for flights and hotels:</p>}
        <p className="link-row">
          <a href={links.flights} target="_blank" rel="noopener noreferrer sponsored">
            Search flights
          </a>
          <a href={links.hotels} target="_blank" rel="noopener noreferrer sponsored">
            Find places to stay
          </a>
        </p>
      </section>
    );
  }

  const n = nights ?? estimate.suggestedNights;
  const lodgingTotal = { low: estimate.lodging.perNight.low * n, high: estimate.lodging.perNight.high * n };
  const travelLow = estimate.flight?.roundTripFare.low ?? estimate.drive?.roundTripCost.low ?? 0;
  const travelHigh = estimate.flight?.roundTripFare.high ?? estimate.drive?.roundTripCost.high ?? 0;

  return (
    <section className="card travel" aria-labelledby="travel-heading">
      <h2 id="travel-heading">Plan a visit</h2>
      <p className="muted">
        About <strong>{formatDistance(estimate.distanceKm)}</strong> from you.{" "}
        {estimate.mode === "local" && "It's close by. You could visit today."}
      </p>

      <dl className="estimates">
        {estimate.drive && (
          <div>
            <dt>Driving, round trip</dt>
            <dd>
              {formatRange(estimate.drive.roundTripCost)}
              <span className="muted"> · about {estimate.drive.hours} h each way, if there&apos;s a road route</span>
            </dd>
          </div>
        )}
        {estimate.flight && (
          <div>
            <dt>Flight, economy round trip</dt>
            <dd>
              {formatRange(estimate.flight.roundTripFare)}
              <span className="muted"> · about {estimate.flight.hours} h door to door</span>
            </dd>
          </div>
        )}
        <div>
          <dt>Lodging per night</dt>
          <dd>
            {formatRange(estimate.lodging.perNight)}
            <span className="muted"> · {estimate.lodging.tier.toLowerCase()}</span>
          </dd>
        </div>
      </dl>

      <label className="nights">
        Nights
        <select value={n} onChange={(e) => setNights(Number(e.target.value))}>
          {[0, 1, 2, 3, 4, 5, 7, 10, 14].map((v) => (
            <option key={v} value={v}>
              {v === 0 ? "Day trip" : v}
            </option>
          ))}
        </select>
      </label>
      <p className="total">
        Estimated total: <strong>{formatUsd(travelLow + lodgingTotal.low)}–{formatUsd(travelHigh + lodgingTotal.high)}</strong>{" "}
        <span className="muted">per person</span>
      </p>

      <p className="link-row">
        {estimate.flight && (
          <a href={links.flights} target="_blank" rel="noopener noreferrer sponsored">
            Compare flights
          </a>
        )}
        {estimate.drive && (
          <a href={links.driving} target="_blank" rel="noopener noreferrer">
            Driving directions
          </a>
        )}
        {estimate.mode !== "fly" && (
          <a href={links.transit} target="_blank" rel="noopener noreferrer">
            Public transport
          </a>
        )}
        <a href={links.hotels} target="_blank" rel="noopener noreferrer sponsored">
          Find places to stay
        </a>
      </p>
      <p className="hint estimate-note">
        These are rough estimates in US dollars from typical prices, not quotes. Real prices vary with season, airline and how early
        you book.
      </p>
    </section>
  );
}
