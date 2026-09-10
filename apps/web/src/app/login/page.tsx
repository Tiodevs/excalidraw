"use client";

import { FormEvent, useEffect, useState } from "react";
import { fetchMe, getToken, login, setToken } from "@/lib/api";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!getToken()) return;
    fetchMe()
      .then(() => {
        window.location.replace("/");
      })
      .catch(() => {
        // token inválido, permanece no login
      });
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { token } = await login(password);
      setToken(token);
      window.location.href = "/";
    } catch {
      setError("Senha incorreta.");
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
          <rect x="6" y="8" width="36" height="32" rx="6" fill="#fff" stroke="#1b1b1f" strokeWidth="2" />
          <path
            d="M12 31c4-8 7-4 10-10 3 7 5 1 9 8 3-6 6-3 9 4"
            fill="none"
            stroke="#e03131"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
        <h1>Excalidraw</h1>
        <p>Editor pessoal com backup automático. Entre com a senha para abrir seus desenhos.</p>
        <label htmlFor="password">Senha</label>
        <input
          id="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error ? <div className="login-error">{error}</div> : null}
        <button type="submit" disabled={loading || !password}>
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
