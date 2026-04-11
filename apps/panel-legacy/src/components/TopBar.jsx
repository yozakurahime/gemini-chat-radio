import React from 'react';

export default function TopBar({ connected, radioPlaying, volume, nextAd, theme, onToggleTheme, stats, onToggleSidebar, onToggleRight, onOpenKnowledge }) {
  return (
    <div className="topbar">
      <div className="topbar-left">
        <button className="btn ghost drawer-btn" onClick={onToggleSidebar}>Conversas</button>
        <span className={`status-pill ${connected ? 'ok' : 'warn'}`}>{connected ? 'BOT ONLINE' : 'OFFLINE'}</span>
        <span className="muted">RÁDIO: {radioPlaying ? 'ON' : 'OFF'}</span>
      </div>
      <div className="topbar-center">
        <span className="badge">Sistema Online</span>
        <span className="muted">IN {stats?.inbound || 0}</span>
        <span className="muted">OUT {stats?.outbound || 0}</span>
      </div>
      <div className="topbar-right">
        <button className="btn ghost drawer-btn" onClick={onToggleRight}>Painel</button>
        <button className="btn ghost" onClick={onOpenKnowledge}>Conhecimento</button>
        <span className="muted">VOL {volume}%</span>
        <span className="muted">NEXT AD: {nextAd}</span>
        <button className="btn" onClick={onToggleTheme}>{theme === 'dark' ? 'LIGHT' : 'DARK'}</button>
      </div>
    </div>
  );
}
