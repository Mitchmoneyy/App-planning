/**
 * The globe, drawn natively with Mapbox: the same style, tiles and places as
 * the website, at native speed. Tap any place for its card; tap a cluster to
 * zoom in; search for places, cities and countries.
 */
import Mapbox, { Camera, CircleLayer, FillExtrusionLayer, Images, LineLayer, LocationPuck, MapView, ShapeSource } from "@rnmapbox/maps";
import * as Location from "expo-location";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import PlaceSheet, { type TappedPlace } from "../../components/PlaceSheet";
import SearchBox from "../../components/SearchBox";
import { getJson, type PlaceDetails, type SearchHit } from "../../lib/api";
import { MAPBOX_TOKEN } from "../../lib/config";
import { FAITH_ICONS } from "../../lib/faithIcons";
import { appStyle } from "../../lib/mapStyle";

/** The Mapbox token: from app.json, or else the website's own (set once, in Vercel). */
let tokenPromise: Promise<boolean> | null = null;
function ensureToken(): Promise<boolean> {
  tokenPromise ??= (async () => {
    const token = MAPBOX_TOKEN || (await getJson<{ mapboxToken: string | null }>("/api/app-config").then((c) => c.mapboxToken ?? "").catch(() => ""));
    if (token) await Mapbox.setAccessToken(token);
    return Boolean(token);
  })();
  return tokenPromise;
}

const TAPPABLE = ["landmarks-icon", "places-icon", "clusters", "fp-fill"];
const GOLD = "#ffcf6b";
type Position = [number, number];

export default function GlobeScreen() {
  const [token, setToken] = useState<"loading" | "ok" | "missing">("loading");
  useEffect(() => {
    ensureToken().then((ok) => setToken(ok ? "ok" : "missing"));
  }, []);
  if (token === "loading") {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color="#e6c587" size="large" />
      </View>
    );
  }
  if (token === "missing") {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.notice}>The globe needs a Mapbox token: set NEXT_PUBLIC_MAPBOX_TOKEN on the website, or expo.extra.mapboxToken in app.json.</Text>
      </View>
    );
  }
  return <Globe />;
}

function Globe() {
  const scheme = useColorScheme();
  const theme = scheme === "light" ? "light" : "dark";
  const styleJSON = useMemo(() => appStyle(theme), [theme]);
  const map = useRef<MapView>(null);
  const camera = useRef<Camera>(null);
  const [selected, setSelected] = useState<TappedPlace | null>(null);
  const [outline, setOutline] = useState<GeoJSON.Geometry | null>(null);
  const [me, setMe] = useState<{ lat: number; lon: number } | null>(null);
  const [showMe, setShowMe] = useState(false);

  const flyTo = useCallback((lon: number, lat: number, zoom: number, pitch = 0) => {
    camera.current?.setCamera({ centerCoordinate: [lon, lat], zoomLevel: zoom, pitch, animationMode: "flyTo", animationDuration: 2200 });
  }, []);

  const select = useCallback((p: TappedPlace) => {
    setSelected(p);
    setOutline(null);
  }, []);

  const onPress = useCallback(
    async (e: GeoJSON.Feature<GeoJSON.Point, { screenPointX: number; screenPointY: number }>) => {
      const m = map.current;
      if (!m) return;
      const { screenPointX: x, screenPointY: y } = e.properties;
      // A little tolerance around the finger.
      let hit: GeoJSON.Feature | undefined;
      for (const [dx, dy] of [[0, 0], [8, 0], [-8, 0], [0, 8], [0, -8]]) {
        const fc = await m.queryRenderedFeaturesAtPoint([x + dx, y + dy], [], TAPPABLE).catch(() => undefined);
        hit = fc?.features[0];
        if (hit) break;
      }
      if (!hit) {
        setSelected(null);
        return;
      }
      const props = (hit.properties ?? {}) as Record<string, string | number>;
      if (props.point_count) {
        const [lon, lat] = (hit.geometry as GeoJSON.Point).coordinates;
        const zoom = await m.getZoom();
        flyTo(lon, lat, Math.min(zoom + 2.4, 16));
        return;
      }
      const at = hit.geometry.type === "Point" ? (hit.geometry.coordinates as Position) : (e.geometry.coordinates as Position);
      select({ id: String(props.id), name: String(props.name ?? "Place of worship"), faith: String(props.faith ?? "other"), lon: at[0], lat: at[1] });
    },
    [flyTo, select],
  );

  const onPick = useCallback(
    (hit: SearchHit) => {
      if (hit.kind === "place") {
        flyTo(hit.lon, hit.lat, 16.5, 45);
        select({ id: hit.id, name: hit.name, faith: hit.faith, lon: hit.lon, lat: hit.lat });
      } else {
        setSelected(null);
        flyTo(hit.lon, hit.lat, hit.kind === "city" ? 12 : 4.6);
      }
    },
    [flyTo, select],
  );

  const locate = useCallback(async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setMe({ lat: pos.coords.latitude, lon: pos.coords.longitude });
    setShowMe(true);
    flyTo(pos.coords.longitude, pos.coords.latitude, 13);
  }, [flyTo]);

  const highlight = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = [];
    if (selected) features.push({ type: "Feature", geometry: { type: "Point", coordinates: [selected.lon, selected.lat] }, properties: { kind: "pin" } });
    if (outline) features.push({ type: "Feature", geometry: outline, properties: { kind: "outline" } });
    return { type: "FeatureCollection", features };
  }, [selected, outline]);

  return (
    <View style={styles.root}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        styleJSON={styleJSON}
        projection="globe"
        onPress={onPress}
        compassEnabled
        compassPosition={{ top: 120, right: 12 }}
        scaleBarEnabled
        scaleBarPosition={{ bottom: 12, left: 12 }}
        logoPosition={{ bottom: 12, right: 64 }}
        attributionPosition={{ bottom: 12, right: 12 }}
      >
        <Camera ref={camera} defaultSettings={{ centerCoordinate: [12, 22], zoomLevel: 1.4 }} />
        <Images images={FAITH_ICONS} />
        {showMe && <LocationPuck puckBearingEnabled={false} pulsing={{ isEnabled: true }} />}
        <ShapeSource id="app-highlight" shape={highlight}>
          <LineLayer id="app-outline-glow" filter={["==", ["get", "kind"], "outline"]} style={{ lineColor: GOLD, lineWidth: 9, lineBlur: 6, lineOpacity: 0.85 }} />
          <FillExtrusionLayer
            id="app-outline-3d"
            filter={["==", ["get", "kind"], "outline"]}
            minZoomLevel={14.5}
            maxZoomLevel={24}
            style={{ fillExtrusionColor: GOLD, fillExtrusionOpacity: 0.45, fillExtrusionHeight: 18 }}
          />
          <CircleLayer id="app-pin-halo" filter={["==", ["get", "kind"], "pin"]} style={{ circleRadius: 18, circleColor: GOLD, circleOpacity: 0.3, circleBlur: 0.6 }} />
          <CircleLayer id="app-pin" filter={["==", ["get", "kind"], "pin"]} style={{ circleRadius: 6, circleColor: "#fff6dc", circleStrokeColor: GOLD, circleStrokeWidth: 2.5 }} />
        </ShapeSource>
      </MapView>

      <SafeAreaView edges={["top"]} style={styles.top} pointerEvents="box-none">
        <Text style={styles.brand}>✦ Global Sanctuary</Text>
        <SearchBox near={me} onPick={onPick} />
      </SafeAreaView>

      <Pressable style={styles.locate} onPress={locate} accessibilityLabel="Go to my location">
        <Text style={styles.locateText}>◎</Text>
      </Pressable>

      {selected && (
        <PlaceSheet
          key={selected.id}
          place={selected}
          me={me}
          onClose={() => setSelected(null)}
          onDetails={(d: PlaceDetails) => setOutline(d.footprint ?? null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#05070f" },
  center: { alignItems: "center", justifyContent: "center", padding: 24 },
  notice: { color: "#f1ece0", textAlign: "center", fontSize: 15, lineHeight: 21 },
  top: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 12, gap: 8 },
  brand: { color: "#f1ece0", fontSize: 18, fontFamily: "serif", marginTop: 4, textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 8 },
  locate: {
    position: "absolute",
    right: 12,
    bottom: 64,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(8,11,24,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  locateText: { color: "#f1ece0", fontSize: 22 },
});
