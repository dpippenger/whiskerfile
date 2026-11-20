import { afterEach, expect, test } from "bun:test";
import { api, ApiError } from "./api";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Replaces fetch with `answer`, recording each call. */
function server(answer: () => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return answer();
  }) as typeof fetch;
  return calls;
}

test("a GET goes to /api and answers with the parsed JSON", async () => {
  const calls = server(() => Response.json([{ id: 1 }]));
  expect(await api<{ id: number }[]>("/pets")).toEqual([{ id: 1 }]);
  expect(calls).toEqual([{ url: "/api/pets", init: { method: "GET", headers: undefined, body: undefined } }]);
});

test("an object body is sent as JSON, a form as it is", async () => {
  const calls = server(() => Response.json({ id: 2 }, { status: 201 }));
  await api("/pets", { method: "POST", body: { name: "Miso", notes: null } });
  expect(calls[0]!.init).toEqual({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"name":"Miso","notes":null}',
  });

  // No content type of ours: fetch sets the multipart boundary itself.
  const form = new FormData();
  form.append("file", new File(["%PDF-1.7"], "report.pdf"));
  await api("/files", { method: "POST", body: form });
  expect(calls[1]!.init.headers).toBeUndefined();
  expect(calls[1]!.init.body).toBe(form);
});

test("a 204 answers with nothing instead of failing to parse", async () => {
  server(() => new Response(null, { status: 204 }));
  expect(await api("/labs/1", { method: "DELETE" })).toBeUndefined();
});

test("a refusal throws the server's message, status and field errors", async () => {
  server(() => Response.json({ error: "Check the form", fields: { name: "Required" } }, { status: 400 }));
  const err = await api("/pets", { method: "POST", body: {} }).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err).toMatchObject({ message: "Check the form", status: 400, fields: { name: "Required" } });

  server(() => Response.json({ error: "Pet not found" }, { status: 404 }));
  expect(await api("/pets/9").catch((e: unknown) => e)).toMatchObject({
    message: "Pet not found",
    status: 404,
    fields: {},
  });
});

test("a failure that isn't the API's JSON still names its status", async () => {
  // A proxy's error page, and JSON without a message.
  server(() => new Response("<html>Bad gateway</html>", { status: 502 }));
  expect(await api("/pets").catch((e: unknown) => e)).toMatchObject({ message: "Request failed (502)", status: 502 });
  server(() => Response.json({}, { status: 500 }));
  expect(await api("/pets").catch((e: unknown) => e)).toMatchObject({ message: "Request failed (500)", status: 500 });
});
