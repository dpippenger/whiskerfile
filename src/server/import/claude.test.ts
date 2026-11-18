import Anthropic from "@anthropic-ai/sdk";
import { expect, test } from "bun:test";
import type { Extraction } from "../../shared/lab-import";
import { apiError, claudeLabReader, MODEL, ReadLabError } from "./claude";

const EXTRACTION: Extraction = {
  date: "2026-11-06",
  lab: "IDEXX",
  accession: null,
  source: "reference_lab",
  results: [
    { code: "CREA", printedName: "Creatinine", value: "2.9", unit: "mg/dL", rangeLow: "0.6", rangeHigh: "2.4" },
  ],
};
const CATALOG = [
  { code: "CREA", name: "Creatinine" },
  { code: "SDMA", name: "SDMA" },
];
const PDF = { bytes: new TextEncoder().encode("%PDF-1.7 report"), mime: "application/pdf" };

const message = (fields: object) => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: MODEL,
  content: [{ type: "text", text: JSON.stringify(EXTRACTION) }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 10 },
  ...fields,
});
const apiFailure = (status: number, type: string, text: string) =>
  Response.json({ type: "error", error: { type, message: text } }, { status });

/**
 * The real SDK client with the network replaced: each request's URL, headers
 * and body are recorded, and `answer` decides the HTTP response.
 */
function client(answer: () => Response) {
  const requests: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const sdk = new Anthropic({
    apiKey: "test-key",
    // Fixed, so an ANTHROPIC_BASE_URL in the environment can't redirect the test.
    baseURL: "https://api.anthropic.com",
    fetch: async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
      return answer();
    },
  });
  return { sdk, requests };
}

const outcome = (answer: () => Response) =>
  claudeLabReader(client(answer).sdk)(PDF, CATALOG).then(
    (extraction): unknown => extraction,
    (err: ReadLabError): unknown => [err.status, err.message],
  );
const statusOf = async (answer: () => Response) => ((await outcome(answer)) as [number])[0];

test("the request carries the document before the instruction, the catalog, the schema and fallbacks", async () => {
  const { sdk, requests } = client(() => Response.json(message({})));
  expect(await claudeLabReader(sdk)(PDF, CATALOG)).toEqual(EXTRACTION);

  expect(requests).toHaveLength(1);
  const [{ url, headers, body }] = requests as [(typeof requests)[number]];
  expect(new URL(url).pathname).toBe("/v1/messages");
  expect(headers.get("anthropic-beta")).toBe("server-side-fallback-2026-07-01");
  expect(body.model).toBe(MODEL);
  expect(body.fallbacks).toBe("default");
  // Thinking can't be disabled on this model, and forced tool use is refused: neither is sent.
  expect(body).not.toHaveProperty("thinking");
  expect(body).not.toHaveProperty("tool_choice");
  expect(body).not.toHaveProperty("betas");

  const output = body.output_config as { effort: string; format: { type: string; schema: { required: string[] } } };
  expect(output.effort).toBe("high");
  expect(output.format.type).toBe("json_schema");
  expect(output.format.schema.required).toEqual(["date", "lab", "accession", "source", "results"]);
  expect(Object.keys(output.format)).toEqual(["type", "schema"]);

  expect(body.system).toContain("CREA — Creatinine\nSDMA — SDMA");
  expect(body.system).toContain("Never supply a range from general knowledge");
  const [{ content }] = body.messages as [{ content: { type: string; source?: object }[] }];
  expect(content.map((b) => b.type)).toEqual(["document", "text"]);
  expect(content[0]!.source).toEqual({
    type: "base64",
    media_type: "application/pdf",
    data: Buffer.from(PDF.bytes).toString("base64"),
  });
});

test("a photo is sent as an image block of its own type", async () => {
  const { sdk, requests } = client(() => Response.json(message({})));
  await claudeLabReader(sdk)({ bytes: new Uint8Array([0xff, 0xd8, 0xff]), mime: "image/jpeg" }, CATALOG);
  const [{ content }] = requests[0]!.body.messages as [{ content: { type: string; source: object }[] }];
  expect(content[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg" } });
});

test("the stop reason is checked before the reply is parsed", async () => {
  // A refusal with plain text, and a reply cut off part-way through its JSON.
  expect(
    await outcome(() =>
      Response.json(message({ stop_reason: "refusal", content: [{ type: "text", text: "I can't help with that." }] })),
    ),
  ).toEqual([422, "Claude declined to read this document. Enter the results by hand."]);
  expect(
    await outcome(() =>
      Response.json(
        message({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"date":"2026-11-06","re' }] }),
      ),
    ),
  ).toEqual([422, "This document has more results than can be read at once. Enter them by hand."]);
});

test("a reply that isn't the schema's JSON is refused, not passed on", async () => {
  const unusable = [502, "Claude's reading of this document couldn't be used. Try again or enter it by hand."];
  expect(await outcome(() => Response.json(message({ content: [{ type: "text", text: "not json" }] })))).toEqual(
    unusable,
  );
  expect(
    await outcome(() => Response.json(message({ content: [{ type: "text", text: '{"date":null,"results":[{}]}' }] }))),
  ).toEqual(unusable);
  expect(await outcome(() => Response.json(message({ content: [] })))).toEqual(unusable);
});

test("API errors become messages, and a failed request is not retried", async () => {
  let calls = 0;
  const counted = (res: () => Response) => () => {
    calls++;
    return res();
  };
  expect(await outcome(counted(() => apiFailure(401, "authentication_error", "invalid x-api-key")))).toEqual([
    502,
    "The Anthropic API key was refused. Check ANTHROPIC_API_KEY.",
  ]);
  expect(await outcome(counted(() => apiFailure(400, "invalid_request_error", "PDF is password protected")))).toEqual([
    400,
    "Claude couldn't read this file: PDF is password protected",
  ]);
  expect(await statusOf(counted(() => apiFailure(413, "request_too_large", "too big")))).toBe(413);
  expect(await statusOf(counted(() => apiFailure(429, "rate_limit_error", "slow down")))).toBe(503);
  expect(await statusOf(counted(() => apiFailure(529, "overloaded_error", "busy")))).toBe(503);
  expect(await statusOf(counted(() => apiFailure(500, "api_error", "oops")))).toBe(502);
  // Each failure was a single request: a retry would outlast the route's deadline.
  expect(calls).toBe(6);
});

test("the reading's deadline reaches the SDK, which gives up once and says so", async () => {
  let attempts = 0;
  const sdk = new Anthropic({
    apiKey: "test-key",
    baseURL: "https://api.anthropic.com",
    // Answers only when the SDK aborts the request: here, when its deadline passes.
    fetch: (_url: string | URL | Request, init?: RequestInit) => {
      attempts++;
      return new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
      );
    },
  });
  // A short deadline in place of READ_TIMEOUT_SECONDS; the request can't finish any other way.
  await expect(claudeLabReader(sdk, 20)(PDF, CATALOG)).rejects.toMatchObject({
    status: 504,
    message: "Reading the document took too long. Try again.",
  });
  expect(attempts).toBe(1);
});

test("a reading the browser abandoned stops before anything is sent", async () => {
  const { sdk, requests } = client(() => Response.json(message({})));
  const gone = new AbortController();
  gone.abort();
  await expect(claudeLabReader(sdk)(PDF, CATALOG, gone.signal)).rejects.toMatchObject({ status: 499 });
  expect(requests).toEqual([]);
  // Anything else is a bug here, not the API's doing: it isn't dressed up as a message.
  expect(() => apiError(new TypeError("boom"))).toThrow(TypeError);
});
