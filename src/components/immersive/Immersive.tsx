"use client";

/**
 * "Arriving" at a place of worship.
 *
 * 1. The globe flies down from space to the place.
 * 2. The view cross-fades into the best available look-around:
 *    Street View → 360° panorama → Google photorealistic 3D → photo
 *    slideshow → aerial (the live globe itself, at the glowing building).
 * 3. Info and prayer panels float over it; "Back to globe" rises to space again.
 */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGlobe } from "../globe/GlobeContext";
import FavoriteButton from "../FavoriteButton";
import Offering from "../Offering";
import { PrayerForm, PrayerWall } from "../PrayerSpace";
import Reviews from "../Reviews";
import { AboutPanel, PhotosPanel, VisitPanel } from "./InfoPanels";
import KenBurns from "./KenBurns";
import LiveChips from "./LiveChips";
import PanoramaViewer from "./PanoramaViewer";
import Photoreal3D, { photorealAvailable } from "./Photoreal3D";
import SoundControl from "./SoundControl";
import { usePlaceInfo } from "@/hooks/usePlaceInfo";
import { usePlaceStats } from "@/hooks/usePlaceStats";
import { api } from "@/lib/client";
import { faithColor, faithLabel } from "@/lib/faiths";
import type { Place } from "@/lib/types";
import type { StreetView } from "@/server/immersive";
import type { Panorama } from "@/server/wikimedia";

type Tab = "about" | "pray" | "photos" | "visit" | "reviews";
const TABS: { key: Tab; label: string }[] = [
  { key: "about", label: "About" },
  { key: "pray", label: "Pray" },
  { key: "photos", label: "Photos" },
  { key: "visit", label: "Visit" },
  { key: "reviews", label: "Reviews" },
];

type Source =
  | { key: string; kind: "streetview"; label: string }
  | { key: string; kind: "pano"; label: string; pano: Panorama }
  | { key: string; kind: "photoreal"; label: string }
  | { key: string; kind: "photos"; label: string }
  | { key: string; kind: "aerial"; label: string };

export default function Immersive({ place }: { place: Place }) {
  const router = useRouter();
  const params = useSearchParams();
  const { api: globe } = useGlobe();
  const { info, loading } = usePlaceInfo(place.id);
  const { stats, setStats } = usePlaceStats(place.id);

  const [phase, setPhase] = useState<"flying" | "arrived" | "leaving">("flying");
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "about");
  const [panelOpen, setPanelOpen] = useState(true);
  const [views, setViews] = useState<{ streetView: StreetView | null; panoramas: Panorama[] } | null>(null);
  const [sourceKey, setSourceKey] = useState<string | null>(null);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [slide, setSlide] = useState(0);
  const [wallKey, setWallKey] = useState(0);
  const leaving = useRef(false);

  // ---- Fly in from space ------------------------------------------------------
  useEffect(() => {
    if (!globe) return;
    let cancelled = false;
    globe.setPaused(false);
    globe.flyIn({ id: place.id, lat: place.lat, lon: place.lon, footprint: place.footprint }).then(() => {
      if (cancelled) return;
      setPhase("arrived");
    });
    return () => {
      cancelled = true;
      // Leaving any way (back button, a link): return to space.
      globe.setPaused(false);
      if (!leaving.current) globe.flyOut();
    };
  }, [globe, place.id, place.lat, place.lon, place.footprint]);

  // ---- What can we show? -----------------------------------------------------
  useEffect(() => {
    let alive = true;
    api<{ streetView: StreetView | null; panoramas: Panorama[] }>(`/api/places/${place.id}/immersive`)
      .then((v) => alive && setViews(v))
      .catch(() => alive && setViews({ streetView: null, panoramas: [] }));
    return () => {
      alive = false;
    };
  }, [place.id]);

  const sources = useMemo<Source[]>(() => {
    const list: Source[] = [];
    if (views?.streetView) list.push({ key: "streetview", kind: "streetview", label: "Street View" });
    views?.panoramas.forEach((pano, i) => list.push({ key: `pano-${i}`, kind: "pano", label: views.panoramas.length > 1 ? `360° view ${i + 1}` : "360° view", pano }));
    if (photorealAvailable()) list.push({ key: "photoreal", kind: "photoreal", label: "3D" });
    if (info && info.photos.length > 0) list.push({ key: "photos", kind: "photos", label: "Photos" });
    list.push({ key: "aerial", kind: "aerial", label: "Aerial" });
    return list.filter((s) => !failed.has(s.key));
  }, [views, info, failed]);

  // Pick the best view once we know what's available (or after a short wait).
  const ready = views !== null && !loading;
  const [waitedLongEnough, setWaited] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 5000);
    return () => clearTimeout(t);
  }, []);
  const current = sources.find((s) => s.key === sourceKey) ?? (ready || waitedLongEnough ? sources[0] : null);
  const aerial = current?.kind === "aerial";
  const markFailed = useCallback((key: string) => setFailed((f) => new Set(f).add(key)), []);
  const failPhotoreal = useCallback(() => markFailed("photoreal"), [markFailed]);

  // Stop animating the globe while another view covers it.
  useEffect(() => {
    if (!globe || phase !== "arrived") return;
    const t = window.setTimeout(() => !leaving.current && globe.setPaused(!aerial), 1200);
    return () => window.clearTimeout(t);
  }, [globe, phase, aerial]);

  const back = useCallback(async () => {
    if (leaving.current) return;
    leaving.current = true;
    setPhase("leaving");
    globe?.setPaused(false);
    await new Promise((r) => setTimeout(r, 450)); // let the view fade first
    router.push("/");
    globe?.flyOut();
  }, [globe, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back]);

  const arrived = phase === "arrived";
  const where = [place.city, place.country].filter(Boolean).join(", ");

  return (
    <div className={`immersive is-${phase}${aerial ? " is-aerial" : ""}`}>
      {/* While flying: a quiet title over the globe */}
      <div className="arriving" aria-live="polite">
        <p className="eyebrow">Arriving at</p>
        <p className="arriving__name">{place.name}</p>
        <p className="arriving__where">{where}</p>
      </div>

      {/* The look-around view */}
      <div className="immersive__backdrop" aria-hidden={!arrived}>
        {current?.kind === "streetview" && views?.streetView && (
          <iframe
            className="streetview"
            src={views.streetView.embedUrl}
            title={`Street View near ${place.name}`}
            allow="accelerometer; gyroscope; fullscreen"
            referrerPolicy="no-referrer-when-downgrade"
            loading="lazy"
          />
        )}
        {current?.kind === "pano" && (
          <PanoramaViewer key={current.key} url={current.pano.url} onFail={() => markFailed(current.key)} />
        )}
        {current?.kind === "photoreal" && <Photoreal3D lat={place.lat} lon={place.lon} name={place.name} onFail={failPhotoreal} />}
        {current?.kind === "photos" && info && <KenBurns photos={info.photos} onIndex={setSlide} />}
        <div className="immersive__shade" />
      </div>

      {/* Header */}
      <header className="immersive__top">
        <button type="button" className="glass-pill back-pill" onClick={back}>
          <span aria-hidden="true">←</span> Back to globe
        </button>
        <div className="immersive__title">
          <p className="faith-tag">
            <span className="chip__dot" style={{ background: faithColor(place.faith) }} aria-hidden="true" />
            {faithLabel(place.faith)}
            {place.tradition && place.tradition !== faithLabel(place.faith) && <> · {place.tradition}</>}
            {place.heritage && <span className="heritage-mini">UNESCO World Heritage</span>}
          </p>
          <h1>{place.name}</h1>
          <p className="immersive__where">{where}</p>
          <LiveChips place={place} />
        </div>
        <div className="immersive__actions">
          <SoundControl faith={place.faith} />
          <FavoriteButton placeId={place.id} />
        </div>
      </header>

      {/* View switcher + credit for what you're looking at */}
      <footer className="immersive__views">
        {sources.length > 1 && (
          <div className="view-switch" role="tablist" aria-label="Views">
            {sources.map((s) => (
              <button key={s.key} type="button" role="tab" aria-selected={current?.key === s.key} className={current?.key === s.key ? "is-on" : ""} onClick={() => setSourceKey(s.key)}>
                {s.label}
              </button>
            ))}
          </div>
        )}
        <ViewCredit source={current} photo={info?.photos[slide] ?? null} />
      </footer>

      {/* Info & prayer panel */}
      <aside className={`ipanel panel-glass${panelOpen ? "" : " is-collapsed"}`} aria-label={`About ${place.name}`}>
        <div className="ipanel__tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`${tab === t.key ? "is-on" : ""}${t.key === "pray" ? " is-pray" : ""}`}
              onClick={() => {
                setTab(t.key);
                setPanelOpen(true);
              }}
            >
              {t.key === "pray" && <span aria-hidden="true">✦ </span>}
              {t.label}
            </button>
          ))}
          <button type="button" className="ipanel__collapse" onClick={() => setPanelOpen((v) => !v)} aria-label={panelOpen ? "Hide panel" : "Show panel"} title={panelOpen ? "Hide panel to look around" : "Show panel"}>
            {panelOpen ? "›" : "‹"}
          </button>
        </div>

        {panelOpen && (
          <div className="ipanel__scroll">
            {tab === "about" && <AboutPanel place={place} info={info} loading={loading} />}
            {tab === "photos" && <PhotosPanel place={place} info={info} loading={loading} />}
            {tab === "visit" && <VisitPanel place={place} info={info} loading={loading} />}
            {tab === "reviews" && (
              <div className="ipanel__body">
                <Reviews place={place} />
              </div>
            )}
            {tab === "pray" && (
              <div className="ipanel__body pray-panel">
                <Offering placeId={place.id} faith={place.faith} tradition={place.tradition} stats={stats} onStats={setStats} />
                <PrayerForm placeId={place.id} onPosted={() => setWallKey((k) => k + 1)} />
                <PrayerWall key={wallKey} placeId={place.id} />
              </div>
            )}
          </div>
        )}
      </aside>

      {!arrived && phase === "flying" && (
        <button type="button" className="skip-flight" onClick={() => setPhase("arrived")}>
          Skip
        </button>
      )}
      <Link href={`/place/${place.id}?tab=pray`} className="visually-hidden">
        Pray at {place.name}
      </Link>
    </div>
  );
}

function ViewCredit({ source, photo }: { source: Source | undefined | null; photo: { author: string | null; license: string | null; sourceUrl: string; title: string } | null }) {
  if (!source) return null;
  if (source.kind === "streetview") return <p className="view-credit">Imagery © Google Street View</p>;
  if (source.kind === "aerial") return <p className="view-credit">Aerial view · drag to look around, right-drag to tilt</p>;
  if (source.kind === "photoreal") return <p className="view-credit">Photorealistic 3D · Google</p>;
  if (source.kind === "pano") {
    const p = source.pano;
    return (
      <p className="view-credit">
        360° · {p.author ? `${p.author}, ` : ""}
        {p.license ?? ""} · {p.source} ·{" "}
        <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer">
          source
        </a>
      </p>
    );
  }
  if (source.kind === "photos" && photo) {
    return (
      <p className="view-credit">
        {photo.title} · {photo.author ? `${photo.author}, ` : ""}
        {photo.license ?? ""} ·{" "}
        <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer">
          Wikimedia Commons
        </a>
      </p>
    );
  }
  return null;
}
