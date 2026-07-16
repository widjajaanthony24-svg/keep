const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const TOKEN_KEY = "keep_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ? JSON.stringify(body.error) : `Request failed: ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface AuthResponse {
  token: string;
  user: { id: string; email: string; name?: string | null };
}

export const api = {
  signup: (email: string, password: string, name?: string) =>
    request<AuthResponse>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }),

  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<AuthResponse["user"]>("/auth/me"),

  listProjects: () =>
    request<
      Array<{
        id: string;
        name: string;
        mode: string;
        visibility: string;
        createdAt: string;
        updatedAt: string;
      }>
    >("/projects"),

  createProject: (name: string, mode: "creative" | "contract", startFrom: "blank" | "sample") =>
    request<{ id: string }>("/projects", {
      method: "POST",
      body: JSON.stringify({ name, mode, startFrom }),
    }),

  getProject: (id: string) =>
    request<{
      id: string;
      name: string;
      buildingGraph: unknown;
      shareSlug: string | null;
      visibility: string;
    }>(`/projects/${id}`),

  updateProject: (id: string, data: Record<string, unknown>) =>
    request(`/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  deleteProject: (id: string) => request<void>(`/projects/${id}`, { method: "DELETE" }),

  shareProject: (id: string) =>
    request<{ shareSlug: string; visibility: string }>(`/projects/${id}/share`, { method: "POST" }),

  unshareProject: (id: string) =>
    request<{ visibility: string }>(`/projects/${id}/unshare`, { method: "POST" }),
};

// Separate from the authenticated `api` object above on purpose: this never
// sends an auth token, matching the public/unauthenticated endpoint it calls.
export async function fetchPublicProject(
  slug: string
): Promise<{ name: string; buildingGraph: unknown; updatedAt: string }> {
  const res = await fetch(`${API_URL}/public/projects/${slug}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}
