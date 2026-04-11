export const jsonHeaders = { "Content-Type": "application/json" };

export async function apiFetch(url: string, options: RequestInit = {}) {
  const res = await fetch(url, { credentials: "same-origin", ...options });
  if (!res.ok) {
    let code = "api_error";
    let details: unknown = null;
    try {
      const payload = await res.json();
      if (payload && typeof payload.error === "string" && payload.error.trim()) {
        code = payload.error.trim();
      }
      details = payload;
    } catch {
      try {
        const text = await res.text();
        if (text) details = { text };
      } catch {
        /* ignore */
      }
    }

    const err = new Error(code) as Error & { status?: number; code?: string; details?: unknown };
    err.status = res.status;
    err.code = code;
    err.details = details;
    throw err;
  }
  return res;
}
