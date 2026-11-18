/** An API error; `fields` maps invalid field names to messages on a 400. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

/**
 * Calls the JSON API. A plain-object body is sent as JSON, FormData as is.
 * Throws an ApiError carrying the server's message on a non-2xx reply.
 */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const json = init.body !== undefined && !(init.body instanceof FormData);
  const res = await fetch(`/api${path}`, {
    method: init.method ?? "GET",
    headers: json ? { "Content-Type": "application/json" } : undefined,
    body: json ? JSON.stringify(init.body) : (init.body as FormData | undefined),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; fields?: Record<string, string> } | null;
    throw new ApiError(body?.error ?? `Request failed (${res.status})`, res.status, body?.fields);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}
