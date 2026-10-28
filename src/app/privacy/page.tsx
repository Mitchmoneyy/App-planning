import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";

export const metadata: Metadata = { title: "Privacy · Global Sanctuary" };

/**
 * Plain-language privacy notes. Have this reviewed by someone qualified
 * before launch: prayers can reveal religious beliefs, which privacy laws
 * like the GDPR treat as sensitive.
 */
export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main className="narrow-page prose-page">
        <h1>Privacy</h1>
        <p>Prayer is personal. We collect as little as we can and never sell your information.</p>

        <h2>Without an account</h2>
        <ul>
          <li>We set one cookie with a random ID so we can remember your saved places, prayers and candles on this device.</li>
          <li>Your location is used in your browser to center the globe and estimate travel costs. We don&apos;t store it.</li>
        </ul>

        <h2>Prayers</h2>
        <ul>
          <li>
            <strong>Private prayers</strong> are visible only to you. They are encrypted when stored.
          </li>
          <li>
            <strong>Shared prayers</strong> appear on that place&apos;s prayer wall, anonymously unless you choose to add a name. Before
            they appear, the text is checked automatically, which may include sending it to an AI moderation service (Anthropic) that
            does not use it for training.
          </li>
          <li>You can remove any of your prayers at any time from My sanctuary.</li>
        </ul>

        <h2>With an account</h2>
        <ul>
          <li>We store your email, the name you choose, and a securely hashed password.</li>
          <li>You can delete your account, and with it your prayers, reviews and saved places, at any time from My sanctuary.</li>
        </ul>

        <h2>Other sites</h2>
        <p>
          Photos load from Wikimedia, and the map loads from OpenFreeMap. Links to booking sites, Google Maps and others take you to
          those sites, which have their own privacy policies.
        </p>
      </main>
    </>
  );
}
