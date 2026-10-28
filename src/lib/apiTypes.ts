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
