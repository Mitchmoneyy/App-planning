/** Search places, cities, countries and faiths ("mosques in Istanbul") from the globe. */
import { useEffect, useRef, useState } from "react";
import { FlatList, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { faithColor } from "../../../src/lib/faiths";
import { getJson, type SearchHit } from "../lib/api";

export default function SearchBox({ near, onPick }: { near: { lat: number; lon: number } | null; onPick(hit: SearchHit): void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const nearRef = useRef(near);
  nearRef.current = near;

  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) {
      setHits([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      const params = new URLSearchParams({ q: text });
      if (nearRef.current) {
        params.set("lat", nearRef.current.lat.toFixed(2));
        params.set("lon", nearRef.current.lon.toFixed(2));
      }
      getJson<{ hits: SearchHit[] }>(`/api/search?${params}`)
        .then((r) => alive && setHits(r.hits))
        .catch(() => alive && setHits([]));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <View>
      <TextInput
        style={styles.input}
        value={q}
        onChangeText={(v) => {
          setQ(v);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search a place, city, country or faith"
        placeholderTextColor="#8b93a6"
        returnKeyType="search"
        clearButtonMode="while-editing"
        autoCorrect={false}
      />
      {open && hits.length > 0 && (
        <FlatList
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          data={hits}
          keyExtractor={(h, i) => (h.kind === "place" ? h.id : `${h.kind}-${h.name}-${i}`)}
          renderItem={({ item }) => (
            <Pressable
              style={styles.item}
              onPress={() => {
                setQ(item.name);
                setOpen(false);
                Keyboard.dismiss();
                onPick(item);
              }}
            >
              <View style={styles.kindRow}>
                {item.kind === "place" && <View style={[styles.dot, { backgroundColor: faithColor(item.faith) }]} />}
                <Text style={styles.kind}>{item.kind === "place" ? (item.landmark ? "LANDMARK" : "PLACE") : item.kind.toUpperCase()}</Text>
              </View>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.detail}>{item.detail}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 46,
    borderRadius: 23,
    paddingHorizontal: 18,
    fontSize: 16,
    color: "#f1ece0",
    backgroundColor: "rgba(10,13,28,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  list: { marginTop: 6, maxHeight: 360, borderRadius: 16, backgroundColor: "rgba(10,13,28,0.97)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  item: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.08)" },
  kindRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  kind: { color: "#8b93a6", fontSize: 11, letterSpacing: 0.8 },
  name: { color: "#f1ece0", fontSize: 16, marginTop: 2 },
  detail: { color: "#aab2c5", fontSize: 13 },
});
