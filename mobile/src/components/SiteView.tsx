/**
 * A screen of the Global Sanctuary website inside the app (Pray for the
 * world, Your area, My sanctuary, and a place's full view).
 *
 * - Hands the device's push token to the page so notifications reach the account.
 * - Keeps our own pages in the app; opens other sites in the browser.
 * - Android back button goes back in the page first.
 * - `onLeave` fires when the page navigates to the given paths (e.g. a place
 *   view's "Back to globe"), so the native screen can close instead.
 */
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Linking, StyleSheet, View } from "react-native";
import { WebView, type WebViewNavigation } from "react-native-webview";
import { usePushToken } from "../lib/push";
import { APP_USER_AGENT, SITE_HOST, SITE_URL } from "../lib/config";

interface Props {
  path: string;
  /** Close the native screen when the page heads to one of these paths. */
  leaveOn?: string[];
  onLeave?(): void;
}

export default function SiteView({ path, leaveOn = [], onLeave }: Props) {
  // WebView's class type collapses its props to `never` with a ref unless given `object`.
  const web = useRef<WebView<object> | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const pushToken = usePushToken();

  const sendToken = useCallback(() => {
    if (!pushToken) return;
    web.current?.injectJavaScript(`window.__gsSetExpoToken && window.__gsSetExpoToken(${JSON.stringify(pushToken)}); true;`);
  }, [pushToken]);

  // Android back button: page history first (only while this screen is shown).
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (!canGoBack) return false;
        web.current?.goBack();
        return true;
      });
      return () => sub.remove();
    }, [canGoBack]),
  );

  const onShouldStartLoad = useCallback((req: { url: string }) => {
    try {
      const host = new URL(req.url).host;
      if (host === SITE_HOST || req.url.startsWith("about:") || req.url.startsWith("blob:")) return true;
      // Views embedded in the page (Street View, map tiles, 3D, photos) stay inside.
      if (/google\.com\/maps\/embed|googleapis\.com|mapbox\.com|cdn\.jsdelivr\.net|wikimedia|mapillary|openfreemap/.test(req.url)) return true;
    } catch {
      return true;
    }
    Linking.openURL(req.url).catch(() => {});
    return false;
  }, []);

  const onNav = useCallback(
    (s: WebViewNavigation) => {
      setCanGoBack(s.canGoBack);
      try {
        const p = new URL(s.url).pathname;
        if (onLeave && leaveOn.includes(p)) onLeave();
      } catch {
        // ignore
      }
    },
    [leaveOn, onLeave],
  );

  return (
    <View style={styles.root}>
      <WebView<object>
        ref={web}
        source={{ uri: `${SITE_URL}${path}` }}
        style={styles.web}
        applicationNameForUserAgent={APP_USER_AGENT}
        originWhitelist={["https://*", "http://*"]}
        geolocationEnabled
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        allowsInlineMediaPlayback
        allowsBackForwardNavigationGestures
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={onShouldStartLoad}
        onNavigationStateChange={onNav}
        onLoadEnd={sendToken}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.center}>
            <ActivityIndicator color="#e6c587" size="large" />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#05070f" },
  web: { flex: 1, backgroundColor: "#05070f" },
  center: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", backgroundColor: "#05070f" },
});
