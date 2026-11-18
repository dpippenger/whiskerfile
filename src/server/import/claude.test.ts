import Anthropic from "@anthropic-ai/sdk";
import { expect, test } from "bun:test";
import type { Extraction } from "../../shared/lab-import";
import { claudeLabReader, MODEL, READ_TIMEOUT_SECONDS, ReadLabError } from "./claude";

type Params = Parameters<Anthropic["beta"]["messages"]["parse"]>[0];

const EXTRACTION: Extraction = { date: null, lab: null, accession: null, source: null, results: [] };
const CATALOG = [
  { code: "CREA", name: "Creatinine" },
  { code: "SDMA", name: "SDMA" },
];
const PDF = { bytes: new TextEncoder().encode("%PDF-1.7 report"), mime: "application/pdf" };

/** A stand-in for the SDK client that records each request and answers as told. */
function fakeClient(answer: () => unknown) {
  const calls: { params: Params; options: { timeout?: number; maxRetries?: number } }[] = [];
  const client = {
    beta: {
      messages: {
        parse: async (params: Params, options: { timeout?: number; maxRetries?: number }) => {
          calls.push({ params, options });
          return answer();
        },
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

const reply = (fields: object) => ({ stop_reason: "end_turn", parsed_output: EXTRACTION, ...fields });

test("the document comes before the instruction, with the catalog, structured output and fallbacks", async () => {
  const { client, calls } = fakeClient(() => reply({}));
  expect(await claudeLabReader(client)(PDF, CATALOG)).toEqual(EXTRACTION);

  const [{ params, options }] = calls as [(typeof calls)[number]];
  expect(params.model).toBe(MODEL);
  expect(params.output_config?.effort).toBe("high");
  expect(params.output_config?.format?.type).toBe("json_schema");
  expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
  expect(params.fallbacks).toBe("default");
  // Thinking can't be disabled on this model, and forced tool use is refused: neither is sent.
  expect(params.thinking).toBeUndefined();
  expect(params.tool_choice).toBeUndefined();
  expect(params.system).toContain("CREA — Creatinine\nSDMA — SDMA");
  expect(params.system).toContain("Never supply a range from general knowledge");

  const content = params.messages[0]!.content as Anthropic.Beta.BetaContentBlockParam[];
  expect(content.map((b) => b.type)).toEqual(["document", "text"]);
  expect(content[0]).toEqual({
    type: "document",
    source: { type: "base64", media_type: "application/pdf", data: Buffer.from(PDF.bytes).toString("base64") },
  });
  expect(options).toEqual({ timeout: READ_TIMEOUT_SECONDS * 1000, maxRetries: 1 });
});

test("a photo is sent as an image block of its own type", async () => {
  const { client, calls } = fakeClient(() => reply({}));
  await claudeLabReader(client)({ bytes: new Uint8Array([0xff, 0xd8, 0xff]), mime: "image/jpeg" }, CATALOG);
  const content = calls[0]!.params.messages[0]!.content as Anthropic.Beta.BetaContentBlockParam[];
  expect(content[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg" } });
});

test("a refusal, a cut-off reply or an unusable reply each give a message to act on", async () => {
  const outcome = async (answer: () => unknown) =>
    claudeLabReader(fakeClient(answer).client)(PDF, CATALOG).then(
      () => null,
      (err: ReadLabError) => [err.status, err.message],
    );
  expect(await outcome(() => reply({ stop_reason: "refusal" }))).toEqual([
    422,
    "Claude declined to read this document. Enter the results by hand.",
  ]);
  expect(await outcome(() => reply({ stop_reason: "max_tokens" }))).toEqual([
    422,
    "This document has more results than can be read at once. Enter them by hand.",
  ]);
  expect((await outcome(() => reply({ parsed_output: null })))?.[0]).toBe(502);
});

test("API errors become messages, not crashes", async () => {
  const headers = new Headers();
  const failing = (err: Error) =>
    claudeLabReader(
      fakeClient(() => {
        throw err;
      }).client,
    )(PDF, CATALOG).then(
      () => null,
      (e: ReadLabError) => [e.status, e.message],
    );
  expect(await failing(new Anthropic.AuthenticationError(401, {}, "invalid x-api-key", headers))).toEqual([
    502,
    "The Anthropic API key was refused. Check ANTHROPIC_API_KEY.",
  ]);
  expect((await failing(new Anthropic.RateLimitError(429, {}, "slow down", headers)))?.[0]).toBe(503);
  expect((await failing(new Anthropic.ContentTooLargeError(413, {}, "too big", headers)))?.[0]).toBe(413);
  expect(
    await failing(
      new Anthropic.BadRequestError(
        400,
        { type: "error", error: { type: "invalid_request_error", message: "PDF is password protected" } },
        undefined,
        headers,
      ),
    ),
  ).toEqual([400, "Claude couldn't read this file: PDF is password protected"]);
  expect((await failing(new Anthropic.APIConnectionTimeoutError()))?.[0]).toBe(504);
  expect((await failing(new Anthropic.InternalServerError(500, {}, "oops", headers)))?.[0]).toBe(502);
  // Anything else is a bug here, not the API's doing: it isn't dressed up as a message.
  const bug = claudeLabReader(
    fakeClient(() => {
      throw new TypeError("boom");
    }).client,
  )(PDF, CATALOG);
  await expect(bug).rejects.toBeInstanceOf(TypeError);
});
