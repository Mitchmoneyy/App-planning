/** A place's full view (arrival, look around, history, prayer) from the website. */
import { router, useLocalSearchParams } from "expo-router";
import SiteView from "../../components/SiteView";

export default function PlaceScreen() {
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const path = `/place/${encodeURIComponent(id)}${tab ? `?tab=${encodeURIComponent(tab)}` : ""}`;
  // "Back to globe" on the page closes this screen, back to the native globe.
  return <SiteView path={path} leaveOn={["/"]} onLeave={() => router.canGoBack() && router.back()} />;
}
