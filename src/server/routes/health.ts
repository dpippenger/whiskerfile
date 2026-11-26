import { desc, eq } from "drizzle-orm";
import { conditionInput, medicationInput, vaccinationInput } from "../../shared/health";
import type { Db } from "../db";
import {
  conditions,
  medications,
  pets,
  users,
  vaccinations,
  type Condition,
  type Medication,
  type Vaccination,
} from "../db/schema";
import { error, idParam, parseJson, type AppContext, type Authed } from "../http";
import { unknownVet } from "./vets";

type WithAuthor<T> = T & { author: string };
export type PetHealth = {
  vaccinations: WithAuthor<Vaccination>[];
  medications: WithAuthor<Medication>[];
  conditions: WithAuthor<Condition>[];
};

const petExists = (db: Db, id: number) => !!db.select({ id: pets.id }).from(pets).where(eq(pets.id, id)).get();

/** A pet's vaccinations, medications and conditions, newest first, with who added each. */
export function petHealth(db: Db, petId: number): PetHealth {
  return {
    vaccinations: db
      .select({ row: vaccinations, author: users.name })
      .from(vaccinations)
      .innerJoin(users, eq(users.id, vaccinations.createdBy))
      .where(eq(vaccinations.petId, petId))
      .orderBy(desc(vaccinations.dateGiven), desc(vaccinations.id))
      .all()
      .map(({ row, author }) => ({ ...row, author })),
    medications: db
      .select({ row: medications, author: users.name })
      .from(medications)
      .innerJoin(users, eq(users.id, medications.createdBy))
      .where(eq(medications.petId, petId))
      .orderBy(desc(medications.startDate), desc(medications.id))
      .all()
      .map(({ row, author }) => ({ ...row, author })),
    conditions: db
      .select({ row: conditions, author: users.name })
      .from(conditions)
      .innerJoin(users, eq(users.id, conditions.createdBy))
      .where(eq(conditions.petId, petId))
      .orderBy(desc(conditions.date), desc(conditions.id))
      .all()
      .map(({ row, author }) => ({ ...row, author })),
  };
}

export function healthRoutes({ db }: AppContext, authed: Authed) {
  return {
    // A pet's vaccinations, medications and conditions, newest first.
    "/api/pets/:id/health": {
      GET: authed<"/api/pets/:id/health">((req) => {
        const petId = idParam(req.params.id);
        if (!petId || !petExists(db, petId)) return error(404, "Pet not found");
        return Response.json(petHealth(db, petId));
      }),
    },

    "/api/pets/:id/vaccinations": {
      POST: authed<"/api/pets/:id/vaccinations">(async (req, user) => {
        const petId = idParam(req.params.id);
        if (!petId || !petExists(db, petId)) return error(404, "Pet not found");
        const parsed = await parseJson(req, vaccinationInput);
        if ("response" in parsed) return parsed.response;
        const badVet = unknownVet(db, parsed.data.vetId);
        if (badVet) return badVet;
        const row = db
          .insert(vaccinations)
          .values({ ...parsed.data, petId, createdBy: user.id, createdAt: Date.now() })
          .returning()
          .get();
        return Response.json(row, { status: 201 });
      }),
    },
    "/api/vaccinations/:id": {
      PUT: authed<"/api/vaccinations/:id">(async (req) => {
        const id = idParam(req.params.id);
        if (!id) return error(404, "Vaccination not found");
        const parsed = await parseJson(req, vaccinationInput);
        if ("response" in parsed) return parsed.response;
        const badVet = unknownVet(db, parsed.data.vetId);
        if (badVet) return badVet;
        const row = db.update(vaccinations).set(parsed.data).where(eq(vaccinations.id, id)).returning().get();
        return row ? Response.json(row) : error(404, "Vaccination not found");
      }),
      DELETE: authed<"/api/vaccinations/:id">((req) => {
        const id = idParam(req.params.id);
        const row = id ? db.delete(vaccinations).where(eq(vaccinations.id, id)).returning().get() : undefined;
        return row ? new Response(null, { status: 204 }) : error(404, "Vaccination not found");
      }),
    },

    "/api/pets/:id/medications": {
      POST: authed<"/api/pets/:id/medications">(async (req, user) => {
        const petId = idParam(req.params.id);
        if (!petId || !petExists(db, petId)) return error(404, "Pet not found");
        const parsed = await parseJson(req, medicationInput);
        if ("response" in parsed) return parsed.response;
        const row = db
          .insert(medications)
          .values({ ...parsed.data, petId, createdBy: user.id, createdAt: Date.now() })
          .returning()
          .get();
        return Response.json(row, { status: 201 });
      }),
    },
    "/api/medications/:id": {
      PUT: authed<"/api/medications/:id">(async (req) => {
        const id = idParam(req.params.id);
        if (!id) return error(404, "Medication not found");
        const parsed = await parseJson(req, medicationInput);
        if ("response" in parsed) return parsed.response;
        const row = db.update(medications).set(parsed.data).where(eq(medications.id, id)).returning().get();
        return row ? Response.json(row) : error(404, "Medication not found");
      }),
      DELETE: authed<"/api/medications/:id">((req) => {
        const id = idParam(req.params.id);
        const row = id ? db.delete(medications).where(eq(medications.id, id)).returning().get() : undefined;
        return row ? new Response(null, { status: 204 }) : error(404, "Medication not found");
      }),
    },

    "/api/pets/:id/conditions": {
      POST: authed<"/api/pets/:id/conditions">(async (req, user) => {
        const petId = idParam(req.params.id);
        if (!petId || !petExists(db, petId)) return error(404, "Pet not found");
        const parsed = await parseJson(req, conditionInput);
        if ("response" in parsed) return parsed.response;
        const row = db
          .insert(conditions)
          .values({ ...parsed.data, petId, createdBy: user.id, createdAt: Date.now() })
          .returning()
          .get();
        return Response.json(row, { status: 201 });
      }),
    },
    "/api/conditions/:id": {
      PUT: authed<"/api/conditions/:id">(async (req) => {
        const id = idParam(req.params.id);
        if (!id) return error(404, "Condition not found");
        const parsed = await parseJson(req, conditionInput);
        if ("response" in parsed) return parsed.response;
        const row = db.update(conditions).set(parsed.data).where(eq(conditions.id, id)).returning().get();
        return row ? Response.json(row) : error(404, "Condition not found");
      }),
      DELETE: authed<"/api/conditions/:id">((req) => {
        const id = idParam(req.params.id);
        const row = id ? db.delete(conditions).where(eq(conditions.id, id)).returning().get() : undefined;
        return row ? new Response(null, { status: 204 }) : error(404, "Condition not found");
      }),
    },
  };
}
