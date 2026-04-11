import React from 'react';

export default function MiniPlayer({ visible, title, playing, volume, onToggle, onOpen }) {
  if (!visible) return null;
  return (
    <div className="mini-player">
      <div className="mini-info">
        <div className="mini-label">Rádio</div>
        <div className="mini-title">{title}</div>
        <div className="mini-muted">VOL {volume}%</div>
      </div>
      <div className="mini-actions">
        <button className="btn" onClick={onToggle}>{playing ? 'Pause' : 'Play'}</button>
        <button className="btn accent" onClick={onOpen}>Abrir</button>
      </div>
    </div>
  );
}
