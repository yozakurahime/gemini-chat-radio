import React from 'react';

export default function Sidebar({ chats, chatTab, onTabChange, search, onSearch, onSelectChat, currentChatId, totalUnread, formatPhone, formatTime }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">Atendimentos</div>
        <div className="sidebar-meta">{totalUnread} não lidas</div>
      </div>
      <div className="sidebar-search">
        <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Buscar contato..." />
      </div>
      <div className="sidebar-tabs">
        <button className={chatTab === 'active' ? 'active' : ''} onClick={() => onTabChange('active')}>Abertos</button>
        <button className={chatTab === 'archived' ? 'active' : ''} onClick={() => onTabChange('archived')}>Finalizados</button>
      </div>
      <div className="sidebar-list">
        {chats.length === 0 && <div className="empty">Nenhum atendimento</div>}
        {chats.map(chat => {
          const tags = Array.isArray(chat.tags) ? chat.tags.filter(Boolean) : [];
          const visibleTags = tags.slice(0, 3);
          const hiddenTags = Math.max(0, tags.length - visibleTags.length);
          return (
            <div
              key={chat.id}
              className={`chat-row ${currentChatId === chat.id ? 'selected' : ''} ${chat.highlightUntil && chat.highlightUntil > Date.now() ? 'highlight' : ''} ${chat.unreadCount > 0 ? 'unread-attention' : ''}`}
              onClick={() => onSelectChat(chat.id)}
            >
              <div className="chat-title">
                <span className="chat-name">{chat.name}</span>
                <span className="chat-phone">{formatPhone(chat.id)}</span>
                {chat.unreadCount > 0 && <span className="unread">{chat.unreadCount}</span>}
              </div>
              <div className="chat-meta">
                <span className="muted">{formatTime(chat.timestamp)}</span>
              </div>
              <div className="chat-preview">{chat.lastMessage || ''}</div>
              {visibleTags.length > 0 && (
                <div className="chat-tags">
                  {visibleTags.map((tag, idx) => (
                    <span key={`${chat.id}-tag-${idx}`} className="chat-tag-pill">{String(tag)}</span>
                  ))}
                  {hiddenTags > 0 && <span className="chat-tag-pill more">+{hiddenTags}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
