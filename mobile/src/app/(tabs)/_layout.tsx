/** The four sections, as native tabs. */
import { Tabs } from "expo-router/tabs";
import { Text } from "react-native";

const icon = (glyph: string) =>
  function TabIcon({ color }: { color: unknown }) {
    return <Text style={{ color: String(color), fontSize: 20, lineHeight: 24 }}>{glyph}</Text>;
  };

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#e6c587",
        tabBarInactiveTintColor: "#aab2c5",
        tabBarStyle: { backgroundColor: "#0b1020", borderTopColor: "rgba(255,255,255,0.1)" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Globe", tabBarIcon: icon("◍") }} />
      <Tabs.Screen name="world" options={{ title: "Pray for the world", tabBarIcon: icon("✧") }} />
      <Tabs.Screen name="area" options={{ title: "Your area", tabBarIcon: icon("♡") }} />
      <Tabs.Screen name="me" options={{ title: "Me", tabBarIcon: icon("☺") }} />
    </Tabs>
  );
}
