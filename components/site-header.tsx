import Link from "next/link";

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  return (
    <header className={compact ? "site-header compact" : "site-header"}>
      <div className="header-inner">
        <Link href="/capture" className="brand" aria-label="OPEN DOOR TOKYO home">
          <span className="brand-mark" aria-hidden="true">
            O
          </span>
          <span>
            <strong>OPEN DOOR TOKYO</strong>
            {!compact && <small>We do not certify. We clarify.</small>}
          </span>
        </Link>
        <div className="header-meta">
          <span className="event-label">AGENT FORGE · TOKYO</span>
          <span className="prototype-label">LIVE PROTOTYPE</span>
        </div>
      </div>
    </header>
  );
}

