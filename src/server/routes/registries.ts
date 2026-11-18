import { asc, eq } from "drizzle-orm";
import { chipRegistryInput } from "../../shared/pets";
import { chipRegistries, pets } from "../db/schema";
import { error, idParam, parseJson, type AppContext, type Authed } from "../http";

const isUniqueViolation = (err: unknown) => err instanceof Error && /UNIQUE constraint failed/.test(err.message);
const duplicate = () => error(409, "A registry with that name already exists", { name: "Already exists" });

export function registryRoutes({ db }: AppContext, authed: Authed) {
  return {
    "/api/chip-registries": {
      GET: authed(() => Response.json(db.select().from(chipRegistries).orderBy(asc(chipRegistries.name)).all())),
      POST: authed(async (req) => {
        const parsed = await parseJson(req, chipRegistryInput);
        if ("response" in parsed) return parsed.response;
        try {
          return Response.json(db.insert(chipRegistries).values(parsed.data).returning().get(), { status: 201 });
        } catch (err) {
          if (isUniqueViolation(err)) return duplicate();
          throw err;
        }
      }),
    },

    "/api/chip-registries/:id": {
      PUT: authed<"/api/chip-registries/:id">(async (req) => {
        const id = idParam(req.params.id);
        if (!id) return error(404, "Registry not found");
        const parsed = await parseJson(req, chipRegistryInput);
        if ("response" in parsed) return parsed.response;
        try {
          const row = db.update(chipRegistries).set(parsed.data).where(eq(chipRegistries.id, id)).returning().get();
          return row ? Response.json(row) : error(404, "Registry not found");
        } catch (err) {
          if (isUniqueViolation(err)) return duplicate();
          throw err;
        }
      }),
      DELETE: authed<"/api/chip-registries/:id">((req) => {
        const id = idParam(req.params.id);
        if (!id) return error(404, "Registry not found");
        const user = db.select({ name: pets.name }).from(pets).where(eq(pets.chipRegistryId, id)).get();
        if (user) return error(409, `${user.name}'s microchip uses this registry. Change it first.`);
        const row = db.delete(chipRegistries).where(eq(chipRegistries.id, id)).returning().get();
        return row ? new Response(null, { status: 204 }) : error(404, "Registry not found");
      }),
    },
  };
}
