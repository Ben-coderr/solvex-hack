'use client';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** fetch → JSON with the server's error message surfaced (the session cookie rides along automatically). */
export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { ...(init?.json !== undefined && { 'Content-Type': 'application/json' }), ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    cache: 'no-store',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string }).error ?? `HTTP ${res.status}`);
  return body as T;
}

/** "14:33" in Algeria local time (UTC+1, no DST), Western digits in every locale. */
export const hhmm = (d: Date | string) => {
  const x = new Date(new Date(d).getTime() + 3_600_000);
  return `${String(x.getUTCHours()).padStart(2, '0')}:${String(x.getUTCMinutes()).padStart(2, '0')}`;
};
