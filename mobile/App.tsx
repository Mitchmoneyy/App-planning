/**
 * Global Sanctuary for iOS and Android.
 *
 * The app shows the same Global Sanctuary website inside a native shell, so
 * every feature (the globe, immersive views, prayer) is shared with the web
 * with no duplicate code. The native layer adds what a website can't do well
 * on phones:
 *   - push notifications ("Someone in Brazil prayed for you") via Expo,
 *   - location permission for centring the globe,
 *   - the Android back button, and opening external links in the browser.
 *
 * Set the site address in app.json → expo.extra.siteUrl (or EXPO_PUBLIC_SITE_URL).
 */
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Linking, PermissionsAndroid, Platform, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewNavigation } from "react-native-webview";

const SITE_URL: string = (process.env.EXPO_PUBLIC_SITE_URL || (Constants.expoConfig?.extra?.siteUrl as string) || "").replace(/\/$/, "");
const SITE_HOST = SITE_URL ? new URL(SITE_URL).host : "";

// Show notifications even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Ask for permission and get this device's Expo push token (real devices only). */
async function registerForPush(): Promise<string | null> {
  if (!Device.isDevice) return null;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Prayers",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const status = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!status.granted) return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  try {
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return token.data;
  } catch {
    return null; // e.g. no EAS project id configured yet
  }
}

/** Android needs the app itself to hold location permission before the page can ask. */
async function ensureAndroidLocation() {
  if (Platform.OS !== "android") return;
  await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION).catch(() => null);
}

export default function App() {
  // WebView's class type defaults its extra-props parameter to `undefined`, which
  // collapses its props to `never` when a ref is attached; `object` avoids that.
  const web = useRef<WebView<object> | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [ready, setReady] = useState(Platform.OS !== "android");

  // Location first (Android), then load the page.
  useEffect(() => {
    ensureAndroidLocation().finally(() => setReady(true));
  }, []);

  // Push notifications: get a token, then hand it to the website once loaded.
  useEffect(() => {
    registerForPush().then(setPushToken);
  }, []);

  const sendTokenToPage = useCallback(() => {
    if (!pushToken) return;
    // The website registers the token with the signed-in account (see AppBridge on the web).
    web.current?.injectJavaScript(`window.__gsSetExpoToken && window.__gsSetExpoToken(${JSON.stringify(pushToken)}); true;`);
  }, [pushToken]);

  useEffect(sendTokenToPage, [sendTokenToPage]);

  // Tapping a notification opens the right screen.
  useEffect(() => {
    const open = (path: unknown) => {
      if (typeof path !== "string" || !path.startsWith("/")) return;
      web.current?.injectJavaScript(`window.location.href = ${JSON.stringify(SITE_URL + path)}; true;`);
    };
    const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data?.url));
    const last = Notifications.getLastNotificationResponse();
    if (last) open(last.notification.request.content.data?.url);
    return () => sub.remove();
  }, []);

  // Android back button goes back in the page history first.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) {
        web.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  // Keep our own pages in the app; open everything else (Wikipedia, booking sites…) in the browser.
  const onShouldStartLoad = useCallback((req: { url: string }) => {
    try {
      const host = new URL(req.url).host;
      if (host === SITE_HOST || req.url.startsWith("about:") || req.url.startsWith("blob:")) return true;
      // Embedded views (Street View, map tiles) load inside frames and must stay.
      if (/google\.com\/maps\/embed|openfreemap|wikimedia|mapillary/.test(req.url)) return true;
    } catch {
      return true;
    }
    Linking.openURL(req.url).catch(() => {});
    return false;
  }, []);

  if (!SITE_URL) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Set expo.extra.siteUrl in app.json to your Global Sanctuary web address.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {ready && (
        <WebView<object>
          ref={web}
          source={{ uri: SITE_URL }}
          style={styles.web}
          originWhitelist={["https://*", "http://*"]}
          geolocationEnabled
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          allowsInlineMediaPlayback
          allowsBackForwardNavigationGestures
          pullToRefreshEnabled
          setSupportMultipleWindows={false}
          onShouldStartLoadWithRequest={onShouldStartLoad}
          onNavigationStateChange={(s: WebViewNavigation) => setCanGoBack(s.canGoBack)}
          onLoadEnd={sendTokenToPage}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.center}>
              <ActivityIndicator color="#e6c587" size="large" />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#05070f" },
  web: { flex: 1, backgroundColor: "#05070f" },
  center: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", backgroundColor: "#05070f", padding: 24 },
  text: { color: "#f1ece0", textAlign: "center", fontSize: 16 },
});
