// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import { useState, useEffect } from 'react';
import { Globe, Linkedin } from '@/lib/lucide-icons';

const TOPBAR_STYLE: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '10px 24px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  background: 'rgba(8,13,24,0.85)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
};

const SOCIAL_ICON_STYLE: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: '32px', height: '32px', borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.04)',
  color: '#94a3b8', textDecoration: 'none', transition: 'color 0.15s, background 0.15s',
};

const GITHUB_LINK_STYLE: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '7px',
  padding: '5px 12px', borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.04)',
  color: '#94a3b8', fontSize: '12px', fontWeight: 500,
  textDecoration: 'none', transition: 'color 0.15s, background 0.15s',
};

const HOVER_ON: React.CSSProperties = { color: '#f1f5f9', background: 'rgba(255,255,255,0.08)' };
const HOVER_OFF: React.CSSProperties = { color: '#94a3b8', background: 'rgba(255,255,255,0.04)' };

function formatStars(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace('.0', '')}k` : String(n);
}

export const TopBar = () => {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    fetch('https://api.github.com/repos/franciscovaleromartin/graphmycode')
      .then(r => r.ok ? r.json() : null)
      .then(d => d?.stargazers_count != null && setStars(d.stargazers_count))
      .catch(() => { });
  }, []);

  return (
    <div style={TOPBAR_STYLE}>
      <span style={{ fontSize: '16px', fontWeight: 600, letterSpacing: '-0.02em', color: '#f1f5f9' }}>
        <span style={{ color: '#e879f9' }}>Graph</span>My<span style={{ color: '#22d3ee' }}>Code</span>
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <a
          href="https://github.com/franciscovaleromartin/graphmycode"
          target="_blank"
          rel="noopener noreferrer"
          style={GITHUB_LINK_STYLE}
          onMouseEnter={e => Object.assign((e.currentTarget as HTMLAnchorElement).style, HOVER_ON)}
          onMouseLeave={e => Object.assign((e.currentTarget as HTMLAnchorElement).style, HOVER_OFF)}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="#facc15" aria-hidden="true">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          <span>{stars !== null ? formatStars(stars) : '—'}</span>
        </a>

        <a
          href="https://francisco-valero.com"
          target="_blank"
          rel="noopener noreferrer"
          style={SOCIAL_ICON_STYLE}
          onMouseEnter={e => Object.assign((e.currentTarget as HTMLAnchorElement).style, HOVER_ON)}
          onMouseLeave={e => Object.assign((e.currentTarget as HTMLAnchorElement).style, HOVER_OFF)}
          title="Portfolio"
        >
          <Globe size={16} />
        </a>

        <a
          href="https://www.linkedin.com/in/francisco-valero/"
          target="_blank"
          rel="noopener noreferrer"
          style={SOCIAL_ICON_STYLE}
          onMouseEnter={e => Object.assign((e.currentTarget as HTMLAnchorElement).style, HOVER_ON)}
          onMouseLeave={e => Object.assign((e.currentTarget as HTMLAnchorElement).style, HOVER_OFF)}
          title="LinkedIn"
        >
          <Linkedin size={16} />
        </a>
      </div>
    </div>
  );
};
