import React, { useState } from 'react';

export default function RadioPanel({ onClose, radio, playlist, ads, suggestions, ducking, onToggleRadio, onSkip, onUpdateSettings, onAddTrack, onRemoveTrack, onFetchSuggestions, onResolveSuggestion, onPlayAd, onUpdateDucking }) {
  const [tab, setTab] = useState('playlist');
  const [newTrack, setNewTrack] = useState('');

  return (
    <div className="modal">
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <div className="modal-title">Rádio HimeFit</div>
            <div className="muted">Estação Principal</div>
          </div>
          <button className="btn" onClick={onClose}>Fechar</button>
        </div>

        <div className="modal-body">
          <div className="radio-left">
            <div className="now-playing">
              <div className="title">{radio.currentTrack ? radio.currentTrack.title : 'Aguardando...'}</div>
              <div className="muted">{radio.isPlaying ? 'Reproduzindo agora' : 'Pausado'}</div>
            </div>
            <div className="radio-controls">
              <button className="btn accent" onClick={onToggleRadio}>{radio.isPlaying ? 'Pause' : 'Play'}</button>
              <button className="btn" onClick={onSkip}>Skip</button>
            </div>

            <div className="slider-group">
              <label>Música {radio.musicVolume}%</label>
              <input type="range" min="0" max="100" value={radio.musicVolume} onChange={(e) => onUpdateSettings({ musicVolume: Number(e.target.value) })} />
            </div>
            <div className="slider-group">
              <label>Anúncios {radio.adVolume}%</label>
              <input type="range" min="0" max="100" value={radio.adVolume} onChange={(e) => onUpdateSettings({ adVolume: Number(e.target.value) })} />
            </div>
            <div className="slider-group">
              <label>Freq. Anúncios (min)</label>
              <input type="number" min="1" value={radio.adFrequency} onChange={(e) => onUpdateSettings({ adFrequency: Number(e.target.value) })} />
            </div>
          </div>

          <div className="radio-right">
            <div className="tabs">
              <button className={tab === 'playlist' ? 'active' : ''} onClick={() => setTab('playlist')}>Playlist</button>
              <button className={tab === 'ads' ? 'active' : ''} onClick={() => setTab('ads')}>Anúncios</button>
              <button className={tab === 'sug' ? 'active' : ''} onClick={() => { onFetchSuggestions(); setTab('sug'); }}>Pedidos</button>
            </div>

            {tab === 'playlist' && (
              <div className="tab-content">
                <div className="add-track">
                  <input value={newTrack} onChange={(e) => setNewTrack(e.target.value)} placeholder="Nome da Música ou Link..." />
                  <button className="btn" onClick={() => { onAddTrack(newTrack); setNewTrack(''); }}>Add</button>
                </div>
                <div className="list">
                  {playlist.map((track, idx) => (
                    <div key={track.id} className="list-row">
                      <div className="list-title">{idx + 1}. {track.title}</div>
                      <div className="list-actions">
                        <span className="muted">{track.duration}</span>
                        <button className="btn ghost" onClick={() => onRemoveTrack(track.id)}>Remover</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'ads' && (
              <div className="tab-content">
                <div className="ducking">
                  <label><input type="checkbox" checked={ducking.enabled} onChange={(e) => onUpdateDucking({ ...ducking, enabled: e.target.checked })} /> Ducking</label>
                  <div className="slider-group">
                    <label>Ducking (dB) {ducking.levelDb}</label>
                    <input type="range" min="-24" max="-12" value={ducking.levelDb} onChange={(e) => onUpdateDucking({ ...ducking, levelDb: Number(e.target.value) })} />
                  </div>
                  <div className="slider-group">
                    <label>Attack (ms) {ducking.attackMs}</label>
                    <input type="range" min="30" max="80" value={ducking.attackMs} onChange={(e) => onUpdateDucking({ ...ducking, attackMs: Number(e.target.value) })} />
                  </div>
                  <div className="slider-group">
                    <label>Release (ms) {ducking.releaseMs}</label>
                    <input type="range" min="300" max="1200" value={ducking.releaseMs} onChange={(e) => onUpdateDucking({ ...ducking, releaseMs: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="list">
                  {ads.map(file => (
                    <div key={file} className="list-row">
                      <div className="list-title">{file}</div>
                      <div className="list-actions">
                        <button className="btn ghost" onClick={() => onPlayAd(file)}>Tocar</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'sug' && (
              <div className="tab-content">
                {suggestions.length === 0 && <div className="muted">Nenhum pedido pendente.</div>}
                {suggestions.map(s => (
                  <div key={s.id} className="list-row">
                    <div className="list-title">{s.song_name}</div>
                    <div className="list-actions">
                      <button className="btn" onClick={() => onResolveSuggestion(s.id, 'approve', s.song_name)}>Aceitar</button>
                      <button className="btn danger" onClick={() => onResolveSuggestion(s.id, 'reject')}>Recusar</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
