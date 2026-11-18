import { eq } from "drizzle-orm";
import { jwtVerify, type JWTVerifyGetKey } from "jose";
import type { Db } from "./db";
import { users, type User } from "./db/schema";

export type AuthOptions =
  | { mode: "dev" }
  | { mode: "access"; keys: JWTVerifyGetKey; issuer: string; audience: string };

const DEV_EMAIL = "dev@localhost";

/**
 * Resolves the signed-in user for a request, or null when it carries no valid
 * Cloudflare Access token. Users are created on their first valid request:
 * who may reach the app at all is decided by the Access policy.
 */
export function createAuthenticator(db: Db, options: AuthOptions) {
  return async function authenticate(req: Request): Promise<User | null> {
    let email = DEV_EMAIL;
    if (options.mode === "access") {
      const token = req.headers.get("cf-access-jwt-assertion");
      if (!token) return null;
      try {
        const { payload } = await jwtVerify(token, options.keys, {
          issuer: options.issuer,
          audience: options.audience,
        });
        if (typeof payload.email !== "string" || !payload.email) return null;
        email = payload.email.toLowerCase();
      } catch {
        return null;
      }
    }

    const existing = db.select().from(users).where(eq(users.email, email)).get();
    if (existing) return existing;
    return db
      .insert(users)
      .values({ email, name: email.split("@")[0]!, createdAt: Date.now() })
      .onConflictDoUpdate({ target: users.email, set: { email } })
      .returning()
      .get();
  };
}

export type Authenticate = ReturnType<typeof createAuthenticator>;
