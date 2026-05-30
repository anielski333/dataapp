const BASE = "/api/sales";

export const api = {
  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${path}`, { credentials: "include" });
    if (!res.ok) {
      throw new Error(await res.text().catch(() => res.statusText));
    }
    return res.json();
  },

  async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "include",
    });
    if (!res.ok) {
      throw new Error(await res.text().catch(() => res.statusText));
    }
    return res.json();
  },

  async upload<T>(path: string, formData: FormData): Promise<T> {
    const res = await fetch(`${path}`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    if (!res.ok) {
      throw new Error(await res.text().catch(() => res.statusText));
    }
    return res.json();
  },
};
