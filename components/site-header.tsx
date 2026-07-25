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
            {!compact && <small>電話せず、行く前に判断できる。</small>}
          </span>
        </Link>
        <div className="header-meta">
          <span className="event-label">東京発の来店前情報</span>
          <span className="prototype-label">公開デモ</span>
        </div>
      </div>
    </header>
  );
}
