import type { BunRequest, Server } from "bun";
import type { z } from "zod";
import type { Authenticate } from "./auth";
import type { BackupContext } from "./backup";
import type { User } from "./db/schema";
import type { ReadLab } from "./import/claude";
import type { RenderPdf } from "./report/pdf";

/**
 * What routes share: the database and folders, the PDF printer when Chromium
 * is configured, and the lab document reader when an Anthropic API key is.
 */
export type AppContext = BackupContext & { renderPdf?: RenderPdf; readLab?: ReadLab };

export type Handler<P extends string> = (
  req: BunRequest<P>,
  user: User,
  server: Server<undefined>,
) => Response | Promise<Response>;

export const error = (status: number, message: string, fields?: Record<string, string>) =>
  Response.json(fields ? { error: message, fields } : { error: message }, { status });

/** Wraps a handler so it runs only for a signed-in user; everyone else gets 401. */
export function authedWith(authenticate: Authenticate) {
  return <P extends string>(handler: Handler<P>) =>
    async (req: BunRequest<P>, server: Server<undefined>) => {
      const user = await authenticate(req);
      return user ? handler(req, user, server) : error(401, "Not signed in");
    };
}

export type Authed = ReturnType<typeof authedWith>;

/** A positive integer route id, or null for anything else ("1.5", "abc", "0"). */
export function idParam(value: string | undefined): number | null {
  return value && /^[1-9]\d{0,15}$/.test(value) ? Number(value) : null;
}

/**
 * Parses a JSON body with a schema. Returns the data, or a 400 response
 * naming each invalid field (keyed by its path, e.g. "deceasedOn").
 */
export async function parseJson<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<{ data: z.output<S> } | { response: Response }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { response: error(400, "Request body must be JSON") };
  }
  const result = schema.safeParse(body);
  if (result.success) return { data: result.data };
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) fields[issue.path.join(".") || "_"] ??= issue.message;
  return { response: error(400, "Some fields are invalid", fields) };
}
