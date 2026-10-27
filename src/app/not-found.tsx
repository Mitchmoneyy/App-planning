import Link from "next/link";

export default function NotFound() {
  return (
    <main className="place-page">
      <h1>We couldn&apos;t find that place</h1>
      <p>It may have moved, or the link may be incomplete.</p>
      <p>
        <Link href="/" className="back-link">
          ← Back to the globe
        </Link>
      </p>
    </main>
  );
}
