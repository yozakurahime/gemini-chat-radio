import React, { useState } from 'react';

export default function RightPanel({ tags, tagOptions, onAddTag, onRemoveTag, notes, onChangeNotes, onOpenRadio, radio, onToggleRadio, onSkipRadio, onUpdateRadio, adStatus, onTestAds, notificationPrefs, onUpdateNotificationPrefs, onTestSound, onToggleSystemNotifications }) {
  const [tab, setTab] = useState('radio');
  const nextAdIn = () => {
    if (!radio?.adFrequency) return '—';
    if (!adStatus?.lastAdTime) return 'pronto';
    const cooldownMs = Math.max(60000, radio.adFrequency * 60000);
    const left = Math.max(0, cooldownMs - (Date.now() - adStatus.lastAdTime));
    return left === 0 ? 'pronto' : `${Math.ceil(left / 1000)}s`;
  };
  return (
    <aside className="right-panel-inner">
      <div className="right-tabs">
        <button className={tab === 'radio' ? 'active' : ''} onClick={() => setTab('radio')}>Rádio</button>
        <button className={tab === 'tags' ? 'active' : ''} onClick={() => setTab('tags')}>Etiquetas</button>
        <button className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}>Notas</button>
      </div>

      {tab === 'radio' && (
        <div className="panel-card">
          <div className="panel-title">Rádio</div>
          <div className="radio-docked">
            <div className="radio-info">
              <div className="radio-track">{radio?.currentTrack?.title || 'Aguardando...'}</div>
              <div className="muted">VOL {radio?.musicVolume || 0}%</div>
              <div className="muted">Ads: {adStatus?.currentAd ? 'tocando' : 'idle'} • Próx: {nextAdIn()}</div>
            </div>
            <div className="radio-actions">
              <button className="btn" onClick={onToggleRadio}>{radio?.isPlaying ? 'Pause' : 'Play'}</button>
              <button className="btn ghost" onClick={onSkipRadio}>Skip</button>
              <button className="btn accent" onClick={onOpenRadio}>Abrir</button>
              <button className="btn ghost" onClick={onTestAds}>Testar Ads</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'tags' && (
        <div className="panel-card">
          <div className="panel-title">Etiquetas</div>
          <div className="tags">
            {tags.map(tag => (
              <span key={tag} className="tag" onClick={() => onRemoveTag(tag)}>{tag}</span>
            ))}
          </div>
          <div className="tag-options">
            {tagOptions.map(opt => (
              <button key={opt.val} className="btn ghost" onClick={() => onAddTag(opt.val)}>{opt.label}</button>
            ))}
          </div>
        </div>
      )}

      {tab === 'notes' && (
        <div className="panel-card">
          <div className="panel-title">Notas</div>
          <textarea value={notes} onChange={(e) => onChangeNotes(e.target.value)} placeholder="Observações..." />
        </div>
      )}

      <div className="panel-card">
        <div className="panel-title">Notificações</div>
        <div className="prefs">
          <label><input type="checkbox" checked={notificationPrefs.soundEnabled} onChange={(e) => onUpdateNotificationPrefs({ ...notificationPrefs, soundEnabled: e.target.checked })} /> Sons ativados</label>
          <label><input type="checkbox" checked={notificationPrefs.mute} onChange={(e) => onUpdateNotificationPrefs({ ...notificationPrefs, mute: e.target.checked })} /> Mute</label>
          <div className="prefs-row">
            <span className="muted">Volume</span>
            <input type="range" min="0" max="100" value={notificationPrefs.volume} onChange={(e) => onUpdateNotificationPrefs({ ...notificationPrefs, volume: Number(e.target.value) })} />
            <span className="muted">{notificationPrefs.volume}%</span>
            <button className="btn ghost" onClick={onTestSound}>Testar</button>
          </div>
          <label><input type="checkbox" checked={notificationPrefs.notifyBackgroundOnly} onChange={(e) => onUpdateNotificationPrefs({ ...notificationPrefs, notifyBackgroundOnly: e.target.checked })} /> Notificar só em background</label>
          <label><input type="checkbox" checked={notificationPrefs.quietHoursEnabled} onChange={(e) => onUpdateNotificationPrefs({ ...notificationPrefs, quietHoursEnabled: e.target.checked })} /> Quiet Hours</label>
          <div className="prefs-row">
            <input type="time" value={notificationPrefs.quietStart} onChange={(e) => onUpdateNotificationPrefs({ ...notificationPrefs, quietStart: e.target.value })} />
            <span className="muted">até</span>
            <input type="time" value={notificationPrefs.quietEnd} onChange={(e) => onUpdateNotificationPrefs({ ...notificationPrefs, quietEnd: e.target.value })} />
          </div>
          <label><input type="checkbox" checked={notificationPrefs.systemNotifications} onChange={(e) => { onUpdateNotificationPrefs({ ...notificationPrefs, systemNotifications: e.target.checked }); if (e.target.checked) onToggleSystemNotifications(); }} /> Notificação do sistema (Web)</label>
        </div>
      </div>
    </aside>
  );
}

