import { SafeAreaView } from "react-native-safe-area-context";
import SiteView from "../../components/SiteView";

export default function Screen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#05070f" }} edges={["top"]}>
      <SiteView path="/world" />
    </SafeAreaView>
  );
}
