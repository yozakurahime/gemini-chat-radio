import React from 'react';

export default function Toast({ title, message, type, onClick }) {
  return (
    <div className={`toast ${type || 'info'}`} onClick={onClick}>
      <div className="toast-title">{title}</div>
      <div className="toast-msg">{message}</div>
    </div>
  );
}
