/**
 * The card that slides up when you tap a place on the globe: faith and
 * denomination, address, distance, a photo and a little history (when the
 * website has them), and the ways in: arrive, pray, directions, website.
 */
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { faithColor, faithLabel } from "../../../src/lib/faiths";
import { gesturesFor } from "../../../src/lib/gestures";
import { getJson, type PlaceDetails, type PlaceInfo } from "../lib/api";

export interface TappedPlace {
  id: string;
  name: string;
  faith: string;
  lat: number;
  lon: number;
}

const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180;
  const x = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};
const distance = (d: number) => (d < 1 ? `${Math.round(d * 1000)} m` : d < 100 ? `${d.toFixed(1)} km` : `${Math.round(d).toLocaleString()} km`);

export default function PlaceSheet({ place, me, onClose, onDetails }: { place: TappedPlace; me: { lat: number; lon: number } | null; onClose(): void; onDetails(d: PlaceDetails): void }) {
  const [details, setDetails] = useState<PlaceDetails | null>(null);
  const [info, setInfo] = useState<PlaceInfo | null>(null);

  useEffect(() => {
    let alive = true;
    getJson<{ places: PlaceDetails[] }>(`/api/places/lookup?ids=${encodeURIComponent(place.id)}`)
      .then((r) => {
        const d = r.places[0];
        if (alive && d) {
          setDetails(d);
          onDetails(d);
        }
      })
      .catch(() => {});
    getJson<PlaceInfo>(`/api/places/${encodeURIComponent(place.id)}/info`)
      .then((i) => alive && setInfo(i))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one card per place
  }, [place.id]);

  const name = details?.name ?? place.name;
  const where = details ? [details.address, details.city, details.country].filter(Boolean).join(", ") : "";
  const photo = info?.photos?.[0];
  const blurb = info?.description ?? (info?.summary ? info.summary.split(/(?<=[.!?])\s/).slice(0, 2).join(" ") : null);
  const gesture = gesturesFor(place.faith, details?.tradition)[0];
  const website = info?.website ?? details?.website ?? null;
  const coords = `${place.lat},${place.lon}`;

  const directions = () => {
    const url =
      Platform.OS === "ios"
        ? `https://maps.apple.com/?daddr=${coords}&q=${encodeURIComponent(name)}`
        : `https://www.google.com/maps/dir/?api=1&destination=${coords}`;
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={styles.sheet}>
      <View style={styles.handle} />
      <Pressable style={styles.close} onPress={onClose} accessibilityLabel="Close">
        <Text style={styles.closeText}>×</Text>
      </Pressable>
      <ScrollView contentContainerStyle={styles.body}>
        {photo && <Image source={{ uri: photo.thumbUrl }} style={styles.photo} contentFit="cover" accessibilityLabel={photo.title} />}
        <View style={styles.tagRow}>
          <View style={[styles.dot, { backgroundColor: faithColor(place.faith) }]} />
          <Text style={styles.tag}>
            {faithLabel(place.faith).toUpperCase()}
            {details?.tradition && details.tradition !== faithLabel(place.faith) ? ` · ${details.tradition.toUpperCase()}` : ""}
          </Text>
        </View>
        {details?.heritage && <Text style={styles.heritage}>UNESCO World Heritage</Text>}
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.where}>
          {where || (details ? "Address not listed yet" : "…")}
          {me ? ` · ${distance(km(me, place))} away` : ""}
        </Text>
        {blurb && <Text style={styles.blurb}>{blurb}</Text>}

        <Pressable style={styles.primary} onPress={() => router.push({ pathname: "/place/[id]", params: { id: place.id } })}>
          <Text style={styles.primaryText}>Arrive & look around</Text>
        </Pressable>
        <View style={styles.row}>
          <Pressable style={styles.secondary} onPress={() => router.push({ pathname: "/place/[id]", params: { id: place.id, tab: "pray" } })}>
            <Text style={styles.secondaryText}>{gesture.action}</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={directions}>
            <Text style={styles.secondaryText}>Directions</Text>
          </Pressable>
        </View>
        {website && (
          <Pressable onPress={() => Linking.openURL(website).catch(() => {})}>
            <Text style={styles.link}>Official website</Text>
          </Pressable>
        )}
        {photo && (
          <Text style={styles.credit}>
            Photo: {photo.author ? `${photo.author}, ` : ""}
            {photo.license ?? "Wikimedia Commons"}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "62%",
    backgroundColor: "rgba(10,13,28,0.97)",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.25)", marginTop: 8 },
  close: { position: "absolute", top: 10, right: 12, zIndex: 2, width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  closeText: { color: "#f1ece0", fontSize: 22, lineHeight: 24 },
  body: { padding: 18, paddingTop: 12, gap: 8 },
  photo: { width: "100%", height: 150, borderRadius: 14, marginBottom: 4 },
  tagRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingRight: 40 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  tag: { color: "#aab2c5", fontSize: 12, letterSpacing: 0.8 },
  heritage: { color: "#e6c587", fontSize: 12 },
  name: { color: "#f1ece0", fontSize: 24, fontFamily: "serif" },
  where: { color: "#aab2c5", fontSize: 14 },
  blurb: { color: "#e6e2d6", fontSize: 15, lineHeight: 21 },
  primary: { marginTop: 8, backgroundColor: "#e6c587", borderRadius: 999, paddingVertical: 13, alignItems: "center" },
  primaryText: { color: "#1a1306", fontWeight: "700", fontSize: 16 },
  row: { flexDirection: "row", gap: 8 },
  secondary: { flex: 1, borderWidth: 1, borderColor: "rgba(230,197,135,0.6)", borderRadius: 999, paddingVertical: 11, alignItems: "center" },
  secondaryText: { color: "#f1ece0", fontSize: 15 },
  link: { color: "#e6c587", fontSize: 15, marginTop: 4 },
  credit: { color: "#8b93a6", fontSize: 11 },
});
