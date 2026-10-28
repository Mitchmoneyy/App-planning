/**
 * Rough travel cost estimates (USD) from the user's location to a place.
 *
 * These are deliberately simple models, clearly labelled as estimates in the
 * UI, with links out to booking sites for real prices:
 * - Flights: a distance-based fare curve fitted to typical economy round
 *   trips (short hops cost more per km than long-haul), shown as a range.
 * - Driving: road distance ≈ 1.25 × straight-line distance, at a typical
 *   fuel + wear cost per km.
 * - Lodging: typical mid-range hotel price per night by country.
 *
 * Live fares (e.g. Travelpayouts) can replace the flight model later.
 */
import { distanceKm } from "./geo";
import type { LngLat } from "./types";

export type TravelMode = "local" | "drive" | "drive-or-fly" | "fly";

export interface Range {
  low: number;
  high: number;
}

export interface TravelEstimate {
  distanceKm: number;
  mode: TravelMode;
  drive: { roadKm: number; hours: number; roundTripCost: Range } | null;
  flight: { roundTripFare: Range; hours: number } | null;
  lodging: { perNight: Range; tier: string };
  suggestedNights: number;
}

const ROAD_FACTOR = 1.25; // roads wind; straight-line distance underestimates
const DRIVE_SPEED_KMH = 80;
const DRIVE_COST_PER_KM = 0.18; // fuel + wear, typical car
const FLIGHT_SPEED_KMH = 750;
const AIRPORT_OVERHEAD_H = 3; // getting to the airport, security, boarding

/** Typical economy one-way fare: steeper for short hops, flatter for long-haul. */
export function oneWayFare(km: number): number {
  return 60 + 0.12 * Math.min(km, 1500) + 0.065 * Math.max(km - 1500, 0);
}

// Typical mid-range hotel price per night (USD), by country. Very rough by design.
const LODGING_TIERS: { tier: string; perNight: number; countries: string[] }[] = [
  {
    tier: "Higher-cost destination",
    perNight: 220,
    countries: ["Switzerland", "Iceland", "Norway", "Denmark", "Singapore", "United States", "United Kingdom", "Ireland", "Israel", "Jerusalem", "Bhutan"],
  },
  {
    tier: "Moderate-to-high cost",
    perNight: 160,
    countries: [
      "France", "Netherlands", "Belgium", "Sweden", "Finland", "Austria", "Germany", "Italy", "Vatican City", "Australia",
      "New Zealand", "Canada", "Japan", "United Arab Emirates", "South Korea", "Spain", "Portugal", "Greece", "Curaçao",
      "Taiwan", "Oman", "Saudi Arabia", "Brunei", "Czech Republic", "Lebanon",
    ],
  },
  {
    tier: "Moderate cost",
    perNight: 95,
    countries: [
      "Poland", "Hungary", "Romania", "Bulgaria", "Serbia", "Bosnia and Herzegovina", "Turkey", "Mexico", "Brazil", "Argentina",
      "Chile", "Colombia", "Peru", "Ecuador", "Cuba", "Dominican Republic", "Guatemala", "China", "Malaysia", "Thailand",
      "Russia", "Georgia", "Armenia", "South Africa", "Morocco", "Palestine", "Mongolia",
    ],
  },
  {
    tier: "Lower-cost destination",
    perNight: 55,
    countries: [
      "India", "Nepal", "Sri Lanka", "Bangladesh", "Pakistan", "Vietnam", "Laos", "Cambodia", "Myanmar", "Indonesia",
      "Philippines", "Egypt", "Ethiopia", "Uganda", "Ghana", "Senegal", "Mali", "Ivory Coast", "Tunisia", "Algeria", "Iran",
      "Iraq", "Syria", "Afghanistan", "Uzbekistan", "Ukraine",
    ],
  },
];

export function lodgingFor(country: string | null) {
  const match = LODGING_TIERS.find((t) => country && t.countries.includes(country));
  const perNight = match?.perNight ?? 110;
  return { perNight: spread(perNight, 0.35), tier: match?.tier ?? "Typical cost" };
}

/** ±fraction around a value, rounded to friendly numbers. */
function spread(value: number, fraction: number): Range {
  return { low: friendly(value * (1 - fraction)), high: friendly(value * (1 + fraction)) };
}

const friendly = (n: number) => (n < 100 ? Math.round(n / 5) * 5 : n < 1000 ? Math.round(n / 10) * 10 : Math.round(n / 50) * 50);

export function estimateTrip(from: LngLat, to: LngLat, country: string | null): TravelEstimate {
  const km = distanceKm(from, to);
  const mode: TravelMode = km < 30 ? "local" : km < 300 ? "drive" : km < 800 ? "drive-or-fly" : "fly";

  const roadKm = km * ROAD_FACTOR;
  const drive =
    mode === "fly"
      ? null
      : {
          roadKm: Math.round(roadKm),
          hours: Math.round((roadKm / DRIVE_SPEED_KMH) * 10) / 10,
          roundTripCost: spread(roadKm * 2 * DRIVE_COST_PER_KM, 0.2),
        };

  const flight =
    mode === "drive-or-fly" || mode === "fly"
      ? {
          roundTripFare: spread(2 * oneWayFare(km), 0.3),
          hours: Math.round((km / FLIGHT_SPEED_KMH + AIRPORT_OVERHEAD_H) * 2) / 2,
        }
      : null;

  return {
    distanceKm: Math.round(km),
    mode,
    drive,
    flight,
    lodging: lodgingFor(country),
    suggestedNights: km < 300 ? 0 : km < 1500 ? 1 : km < 5000 ? 3 : 5,
  };
}

export const formatUsd = (n: number) => `$${n.toLocaleString("en-US")}`;
export const formatRange = (r: Range) => `${formatUsd(r.low)}–${formatUsd(r.high)}`;
