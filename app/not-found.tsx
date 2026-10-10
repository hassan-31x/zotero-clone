import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="large-empty" style={{ minHeight: "100dvh" }}>
      <span className="small-label muted">MARGIN · 404</span>
      <h1>This page wandered off.</h1>
      <p>Your research is still in your workspace.</p>
      <Link href="/app" className="btn primary">
        Back to workspace
      </Link>
    </main>
  );
}
