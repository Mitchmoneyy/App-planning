import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

export const metadata: Metadata = { title: "About · Global Sanctuary" };

export default function AboutPage() {
  return (
    <>
      <SiteHeader />
      <main className="narrow-page prose-page">
        <h1>About Global Sanctuary</h1>
        <p>
          Global Sanctuary is a quiet place to explore houses of worship of every faith around the world, and to pray at any of them
          from wherever you are. Spin the globe, visit a cathedral, mosque, temple, synagogue or gurdwara, light a candle, and leave a
          prayer, privately or on its prayer wall, where others can pray with you.
        </p>
        <h2>Where the information comes from</h2>
        <ul>
          <li>
            Places and coordinates: <a href="https://www.wikidata.org/">Wikidata</a> and{" "}
            <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors.
          </li>
          <li>
            Background and history: <a href="https://en.wikipedia.org/">Wikipedia</a> (CC BY-SA 4.0), credited on each page.
          </li>
          <li>
            Photos: <a href="https://commons.wikimedia.org/">Wikimedia Commons</a>, each with its author and license.
          </li>
          <li>
            Map: <a href="https://openfreemap.org/">OpenFreeMap</a>, built on OpenStreetMap data.
          </li>
          <li>
            The globe: <a href="https://visibleearth.nasa.gov/">NASA</a> Blue Marble and Earth at Night imagery.
          </li>
          <li>
            Cities: <a href="https://www.geonames.org/">GeoNames</a> (CC BY 4.0). Weather: <a href="https://api.met.no/">MET Norway</a>.
          </li>
          <li>360° views: Wikimedia Commons and Mapillary contributors; Google Street View where available.</li>
        </ul>
        <h2>Open to every faith</h2>
        <p>
          Anyone can send a prayer or blessing to people anywhere in the world, in their own words or using a blessing from one of many
          traditions, and people can ask the world to pray for them. Messages here stay supportive: anything that mocks or attacks
          another faith, or tries to convert people, is held back.
        </p>
        <h2>Travel estimates</h2>
        <p>
          Travel and lodging costs are rough estimates from typical prices, not quotes. Booking links may earn Global Sanctuary a small
          commission at no extra cost to you, which helps keep the sanctuary free.
        </p>
        <h2>Keeping it kind</h2>
        <p>
          Shared prayers and reviews are checked automatically before they appear, and anyone can report something that doesn&apos;t
          belong. Reported prayers are hidden until a person reviews them.
        </p>
        <p>
          <Link href="/privacy">Read how we handle your information</Link>.
        </p>
      </main>
    </>
  );
}
