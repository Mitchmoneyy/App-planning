/**
 * Push notifications ("Someone in Brazil prayed for you"): permission, the
 * device's Expo push token (shared with every web screen), and opening the
 * right screen when a notification is tapped.
 */
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let tokenPromise: Promise<string | null> | null = null;

async function register(): Promise<string | null> {
  if (!Device.isDevice) return null;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", { name: "Prayers", importance: Notifications.AndroidImportance.DEFAULT });
  }
  const current = await Notifications.getPermissionsAsync();
  const status = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!status.granted) return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  try {
    return (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
  } catch {
    return null; // no EAS project id yet
  }
}

/** The device's push token (asked for once, shared by every screen). */
export function usePushToken() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    tokenPromise ??= register();
    let alive = true;
    tokenPromise.then((t) => alive && setToken(t));
    return () => {
      alive = false;
    };
  }, []);
  return token;
}

/** Notification data carries a site path ("/world/requests/…"): open it in the app. */
function openPath(path: unknown) {
  if (typeof path !== "string" || !path.startsWith("/")) return;
  const place = /^\/place\/([^/?#]+)/.exec(path);
  if (place) router.push({ pathname: "/place/[id]", params: { id: decodeURIComponent(place[1]) } });
  else if (path.startsWith("/world")) router.navigate("/world");
  else if (path.startsWith("/area")) router.navigate("/area");
  else if (path.startsWith("/me")) router.navigate("/me");
}

export function useNotificationTaps() {
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => openPath(r.notification.request.content.data?.url));
    const last = Notifications.getLastNotificationResponse();
    if (last) openPath(last.notification.request.content.data?.url);
    return () => sub.remove();
  }, []);
}
