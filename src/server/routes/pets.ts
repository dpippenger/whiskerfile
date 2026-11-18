import { asc, eq } from "drizzle-orm";
import { nextChartColor, petInput } from "../../shared/pets";
import { chipRegistries, files, pets } from "../db/schema";
import { IMAGE_TYPES } from "../files";
import { error, idParam, parseJson, type AppContext, type Authed } from "../http";
import type { z } from "zod";

export function petRoutes({ db }: AppContext, authed: Authed) {
  /** Checks the ids a pet refers to; returns a 400 response when one is wrong. */
  function checkReferences(input: z.output<typeof petInput>): Response | null {
    if (input.chipRegistryId) {
      const registry = db.select().from(chipRegistries).where(eq(chipRegistries.id, input.chipRegistryId)).get();
      if (!registry) return error(400, "Some fields are invalid", { chipRegistryId: "Unknown registry" });
    }
    if (input.photoFileId) {
      const file = db.select().from(files).where(eq(files.id, input.photoFileId)).get();
      if (!file || !IMAGE_TYPES.includes(file.mime)) {
        return error(400, "Some fields are invalid", { photoFileId: "The photo must be a JPEG, PNG, WebP or GIF image" });
      }
    }
    return null;
  }

  return {
    "/api/pets": {
      GET: authed(() => Response.json(db.select().from(pets).orderBy(asc(pets.name)).all())),
      POST: authed(async (req, user) => {
        const parsed = await parseJson(req, petInput);
        if ("response" in parsed) return parsed.response;
        const invalid = checkReferences(parsed.data);
        if (invalid) return invalid;
        const inUse = db.select({ color: pets.chartColor }).from(pets).all().map((p) => p.color);
        const now = Date.now();
        const pet = db
          .insert(pets)
          .values({
            ...parsed.data,
            chartColor: parsed.data.chartColor ?? nextChartColor(inUse),
            createdBy: user.id,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get();
        return Response.json(pet, { status: 201 });
      }),
    },

    "/api/pets/:id": {
      GET: authed<"/api/pets/:id">((req) => {
        const id = idParam(req.params.id);
        const pet = id ? db.select().from(pets).where(eq(pets.id, id)).get() : undefined;
        return pet ? Response.json(pet) : error(404, "Pet not found");
      }),
      // Replaces every editable field.
      PUT: authed<"/api/pets/:id">(async (req) => {
        const id = idParam(req.params.id);
        if (!id) return error(404, "Pet not found");
        const parsed = await parseJson(req, petInput);
        if ("response" in parsed) return parsed.response;
        const invalid = checkReferences(parsed.data);
        if (invalid) return invalid;
        const { chartColor, ...rest } = parsed.data;
        const pet = db
          .update(pets)
          .set({ ...rest, ...(chartColor && { chartColor }), updatedAt: Date.now() })
          .where(eq(pets.id, id))
          .returning()
          .get();
        return pet ? Response.json(pet) : error(404, "Pet not found");
      }),
      DELETE: authed<"/api/pets/:id">((req) => {
        const id = idParam(req.params.id);
        const pet = id ? db.delete(pets).where(eq(pets.id, id)).returning().get() : undefined;
        return pet ? new Response(null, { status: 204 }) : error(404, "Pet not found");
      }),
    },
  };
}
