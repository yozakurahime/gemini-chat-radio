import React, { useEffect, useMemo, useRef, useState } from 'react';

const isSystemMsg = (m) => m.startsWith('Sistema:') || m.startsWith('Hime:');
const getSenderName = (m) => m.split(':')[0];
const getMessageContent = (m) => m.substring(m.indexOf(':') + 1).trim();

export default function ChatPanel({ currentChatId, currentChatName, currentHistory, isChatPaused, onSend, onResume, onEnd, onOpenSidebar, onOpenRight, scrollSignal, hasMore, loadingMore, onLoadMore }) {
  const [draft, setDraft] = useState('');
  const messagesRef = useRef(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const messages = useMemo(() => currentHistory || [], [currentHistory]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    const onScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      setIsAtBottom(nearBottom);
      if (el.scrollTop === 0 && hasMore && !loadingMore) {
        const prevHeight = el.scrollHeight;
        const prevTop = el.scrollTop;
        onLoadMore?.().then(() => {
          requestAnimationFrame(() => {
            const newHeight = el.scrollHeight;
            el.scrollTop = newHeight - prevHeight + prevTop;
          });
        });
      }
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [messages.length, hasMore, loadingMore]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    if (isAtBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isAtBottom]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [currentChatId, scrollSignal]);

  const send = () => {
    if (!draft.trim()) return;
    onSend(draft.trim());
    setDraft('');
  };

  return (
    <section className="chat-panel">
      {!currentChatId ? (
        <div className="empty">Selecione um atendimento</div>
      ) : (
        <>
          <div className="chat-header">
            <div>
              <div className="chat-name">{currentChatName}</div>
              <div className="muted">WhatsApp</div>
            </div>
            <div className="chat-actions">
              <button className="btn ghost drawer-btn" onClick={onOpenSidebar}>Conversas</button>
              <button className="btn ghost drawer-btn" onClick={onOpenRight}>Painel</button>
              <button className="btn" onClick={onResume}>{isChatPaused ? 'Retomar IA' : 'IA Ativa'}</button>
              <button className="btn danger" onClick={onEnd}>Finalizar</button>
            </div>
          </div>
          {isChatPaused && <div className="paused-banner">ATENDIMENTO HUMANO (IA PAUSADA)</div>}
          <div className="chat-messages" ref={messagesRef}>
            {hasMore && (
              <button className="btn ghost load-more" onClick={() => onLoadMore?.()} disabled={loadingMore}>
                {loadingMore ? 'Carregando...' : 'Carregar mais'}
              </button>
            )}
            {messages.map((msg, idx) => (
              <div key={idx} className={`bubble ${msg.startsWith('Usuário:') ? 'user' : isSystemMsg(msg) ? 'system' : 'bot'}`}>
                {!isSystemMsg(msg) && <div className="bubble-sender">{getSenderName(msg)}</div>}
                <div className="bubble-text">{getMessageContent(msg)}</div>
              </div>
            ))}
          </div>
          <div className="chat-composer sticky-composer">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Digite sua mensagem..." onKeyDown={(e) => e.key === 'Enter' && send()} />
            <button className="btn accent" onClick={send}>Enviar</button>
          </div>
        </>
      )}
    </section>
  );
}
