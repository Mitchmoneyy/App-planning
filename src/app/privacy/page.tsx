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

        <h2>Praying for people in places</h2>
        <ul>
          <li>
            <strong>We never store or show anyone&apos;s exact location.</strong> When you use your location, it is rounded in your own
            browser to the nearest city (or just the country) before anything is sent.
          </li>
          <li>When you send a prayer to a place, you choose whether to show where you&apos;re praying from: your city, your country, or nothing.</li>
          <li>Prayer requests show your city or country only, and are anonymous unless you choose to show your first name.</li>
          <li>Your faith is optional, and only shown if you turn that on.</li>
          <li>
            You choose which notifications you get, and how (in the app, email, or push). You can block anyone: their prayers and
            requests disappear for you, and they can&apos;t trigger notifications to you.
          </li>
        </ul>

        <h2>With an account</h2>
        <ul>
          <li>We store your email, the name you choose, and a securely hashed password.</li>
          <li>You can delete your account, and with it your prayers, reviews and saved places, at any time from My sanctuary.</li>
        </ul>

        <h2>Other sites</h2>
        <p>
          Photos load from Wikimedia, the map from OpenFreeMap, and weather from MET Norway (our server asks for it, so your
          location isn&apos;t sent to them). Where it&apos;s set up, Street View is embedded from Google, and Google may set its own cookies. Links to booking sites, Google Maps and others take you to
          those sites, which have their own privacy policies.
        </p>
      </main>
    </>
  );
}
