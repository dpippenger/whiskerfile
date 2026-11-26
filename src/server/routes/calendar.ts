import { asc, eq, isNotNull, sql } from "drizzle-orm";
import { appointmentInput, type CalendarData } from "../../shared/calendar";
import { appointments, medications, pets, vaccinations } from "../db/schema";
import { error, idParam, parseJson, type AppContext, type Authed } from "../http";
import { unknownVet } from "./vets";

export function calendarRoutes({ db }: AppContext, authed: Authed) {
  /**
   * Every pet's dated records as stored. What is due, late or today depends on
   * the reader's date, so the browser works it out (calendarEvents); nothing
   * here reads the server's clock.
   */
  function calendar(): CalendarData {
    return {
      pets: db
        .select({ id: pets.id, name: pets.name, chartColor: pets.chartColor, deceasedOn: pets.deceasedOn })
        .from(pets)
        .orderBy(asc(sql`${pets.name} collate nocase`))
        .all(),
      vaccinations: db
        .select({
          id: vaccinations.id,
          petId: vaccinations.petId,
          vaccine: vaccinations.vaccine,
          dateGiven: vaccinations.dateGiven,
          dueDate: vaccinations.dueDate,
        })
        .from(vaccinations)
        .orderBy(asc(vaccinations.id))
        .all(),
      medications: db
        .select({ id: medications.id, petId: medications.petId, drug: medications.drug, endDate: medications.endDate })
        .from(medications)
        .where(isNotNull(medications.endDate))
        .orderBy(asc(medications.id))
        .all(),
      appointments: db
        .select({
          id: appointments.id,
          petId: appointments.petId,
          date: appointments.date,
          time: appointments.time,
          vetId: appointments.vetId,
          reason: appointments.reason,
          notes: appointments.notes,
        })
        .from(appointments)
        .orderBy(asc(appointments.id))
        .all(),
    };
  }

  return {
    "/api/calendar": { GET: authed(() => Response.json(calendar())) },

    "/api/pets/:id/appointments": {
      POST: authed<"/api/pets/:id/appointments">(async (req, user) => {
        const petId = idParam(req.params.id);
        if (!petId || !db.select({ id: pets.id }).from(pets).where(eq(pets.id, petId)).get()) {
          return error(404, "Pet not found");
        }
        const parsed = await parseJson(req, appointmentInput);
        if ("response" in parsed) return parsed.response;
        const badVet = unknownVet(db, parsed.data.vetId);
        if (badVet) return badVet;
        const now = Date.now();
        const row = db
          .insert(appointments)
          .values({ ...parsed.data, petId, createdBy: user.id, createdAt: now, updatedAt: now })
          .returning()
          .get();
        return Response.json(row, { status: 201 });
      }),
    },

    "/api/appointments/:id": {
      // Replaces every editable field; the appointment stays on its pet.
      PUT: authed<"/api/appointments/:id">(async (req) => {
        const id = idParam(req.params.id);
        if (!id) return error(404, "Appointment not found");
        const parsed = await parseJson(req, appointmentInput);
        if ("response" in parsed) return parsed.response;
        const badVet = unknownVet(db, parsed.data.vetId);
        if (badVet) return badVet;
        const row = db
          .update(appointments)
          .set({ ...parsed.data, updatedAt: Date.now() })
          .where(eq(appointments.id, id))
          .returning()
          .get();
        return row ? Response.json(row) : error(404, "Appointment not found");
      }),
      DELETE: authed<"/api/appointments/:id">((req) => {
        const id = idParam(req.params.id);
        const row = id ? db.delete(appointments).where(eq(appointments.id, id)).returning().get() : undefined;
        return row ? new Response(null, { status: 204 }) : error(404, "Appointment not found");
      }),
    },
  };
}
