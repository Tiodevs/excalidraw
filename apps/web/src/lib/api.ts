export type DrawingSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type Drawing = DrawingSummary & {
  data: Record<string, unknown>;
};

const TOKEN_KEY = "excalidraw.token";
const LAST_DRAWING_KEY = "excalidraw.lastDrawingId";

export function getApiUrl() {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
}

export function getToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

export function getLastDrawingId() {
  return window.localStorage.getItem(LAST_DRAWING_KEY);
}

export function setLastDrawingId(id: string) {
  window.localStorage.setItem(LAST_DRAWING_KEY, id);
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${getApiUrl()}${path}`, {
    ...init,
    headers,
  });

  if (response.status === 401) {
    clearToken();
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    throw new ApiError("Não autenticado", 401);
  }

  if (!response.ok) {
    let message = "Falha na requisição";
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function login(password: string) {
  return request<{ token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export function fetchMe() {
  return request<{ ok: true }>("/auth/me");
}

export function fetchDrawings() {
  return request<{ drawings: DrawingSummary[] }>("/drawings");
}

export function createDrawing(name?: string) {
  return request<{ drawing: Drawing }>("/drawings", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function fetchDrawing(id: string) {
  return request<{ drawing: Drawing }>(`/drawings/${id}`);
}

export function updateDrawing(
  id: string,
  payload: { name?: string; data?: Record<string, unknown> },
) {
  return request<{ drawing: Drawing }>(`/drawings/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteDrawing(id: string) {
  return request<{ ok: true }>(`/drawings/${id}`, { method: "DELETE" });
}

export function fetchLibrary() {
  return request<{ libraryItems: unknown[] }>("/library");
}

export function saveLibrary(libraryItems: unknown[]) {
  return request<{ ok: true }>("/library", {
    method: "PUT",
    body: JSON.stringify({ libraryItems }),
  });
}
