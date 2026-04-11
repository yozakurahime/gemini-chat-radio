import React from 'react';

export default function Login({ connected, loginUser, loginPass, loginError, onChangeUser, onChangePass, onLogin }) {
  return (
    <div className="login">
      <div className="login-card">
        <div className="login-title">Painel do Atendente</div>
        <div className="muted">{connected ? 'Conectado' : 'Conectando...'}</div>
        <input value={loginUser} onChange={(e) => onChangeUser(e.target.value)} placeholder="Usuário" />
        <input type="password" value={loginPass} onChange={(e) => onChangePass(e.target.value)} placeholder="Senha" />
        {loginError && <div className="error">Usuário ou senha inválidos</div>}
        <button className="btn accent" onClick={onLogin}>Entrar</button>
      </div>
    </div>
  );
}
