import Link from "next/link";

export default function Home() {
  return (
    <main className="page">
      <h1>Customer Voice</h1>
      <p>Öppna inmatningen på en surfplatta och väggen på storskärmen.</p>
      <div className="cards">
        <Link className="card" href="/input">
          <h2>Inmatning →</h2>
          <p>Kiosk där besökare lämnar sina röster (text eller tal).</p>
        </Link>
        <Link className="card" href="/wall">
          <h2>Vägg →</h2>
          <p>Levande tankekarta för storskärm: teman → Inera-produkter → behov.</p>
        </Link>
        <Link className="card" href="/admin">
          <h2>Admin →</h2>
          <p>Ladda exempel, gruppera om teman, moderera och exportera.</p>
        </Link>
      </div>
    </main>
  );
}
