/** Shapes returned by the API, shared by server routes and browser code. */

export interface PlaceStatsView {
  candles: number;
  candlesToday: number;
  prayers: number;
}

export interface WallPrayer {
  id: string;
  body: string;
  /** null when posted anonymously. */
  name: string | null;
  createdAt: string;
  prayedCount: number;
  prayedByMe: boolean;
  mine: boolean;
}

export interface OwnPrayer {
  id: string;
  placeId: string;
  placeName: string;
  body: string;
  isPublic: boolean;
  status: "published" | "pending" | "rejected" | "hidden" | "private";
  statusLabel: string;
  createdAt: string;
  prayedCount: number;
}

export interface ReviewView {
  id: string;
  name: string;
  rating: number;
  body: string;
  status: "published" | "pending" | "rejected" | "hidden";
  createdAt: string;
  updatedAt: string;
  mine: boolean;
}

export interface MeView {
  user: { id: string; email: string; displayName: string; isAdmin: boolean } | null;
  favorites: string[];
  /** Storage status, so the UI can warn when data won't be kept. */
  storage: { kind: "memory" | "postgres"; persistent: boolean };
}

export interface SubmitResult {
  ok: boolean;
  status?: string;
  message?: string | null;
  selfHarm?: boolean;
}

// --- Praying for people in places ---------------------------------------------

export interface AreaView {
  kind: "city" | "country";
  /** "Manila" or "Kenya" */
  name: string;
  /** Country name. */
  country: string;
  cc: string;
  cityId: number | null;
  lat: number;
  lon: number;
}

export interface WorldPrayerView {
  id: string;
  body: string;
  /** null when anonymous. */
  name: string | null;
  /** Only when the sender chose to show it. */
  faith: string | null;
  target: AreaView;
  /** Where it was sent from (city or country), if shared. */
  origin: AreaView | null;
  requestId: string | null;
  createdAt: string;
  mine: boolean;
}

/** Light-weight item for the globe's arcs and glow. */
export interface ActivityItem {
  id: string;
  from: { lat: number; lon: number; label: string } | null;
  to: { lat: number; lon: number; label: string };
  createdAt: string;
}

export interface RequestView {
  id: string;
  body: string;
  name: string | null;
  faith: string | null;
  area: AreaView;
  prayedCount: number;
  prayedByMe: boolean;
  mine: boolean;
  closed: boolean;
  visibility: "public" | "unlisted";
  status: "published" | "pending" | "rejected" | "hidden";
  createdAt: string;
}

export interface NotificationView {
  id: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  read: boolean;
}

export interface SettingsView {
  home: AreaView | null;
  notifyRequests: boolean;
  notifyArea: boolean;
  email: boolean;
  push: boolean;
  /** Which delivery channels the server has configured. */
  available: { email: boolean; webPush: boolean; vapidPublicKey: string | null };
}

export interface BlockView {
  id: string;
  label: string;
  createdAt: string;
}
