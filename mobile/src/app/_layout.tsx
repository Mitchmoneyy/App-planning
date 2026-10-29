/** Root: the tabs, with a place's full view opening over them. */
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";
import { useNotificationTaps } from "../lib/push";
import { SITE_URL } from "../lib/config";

export default function RootLayout() {
  useNotificationTaps();
  if (!SITE_URL) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#05070f" }}>
        <Text style={{ color: "#f1ece0", textAlign: "center" }}>Set expo.extra.siteUrl in app.json to your Global Sanctuary web address.</Text>
      </View>
    );
  }
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#05070f" } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="place/[id]" options={{ presentation: "fullScreenModal", animation: "fade" }} />
      </Stack>
    </>
  );
}
