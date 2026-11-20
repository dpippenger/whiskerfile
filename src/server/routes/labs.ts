import { and, asc, desc, eq, inArray, isNotNull, max } from "drizzle-orm";
import type { z } from "zod";
import { analyteInput, labReportInput, parseLabValue } from "../../shared/labs";
import type { Db } from "../db";
import {
  analytes,
  attachments,
  entries,
  files,
  labReports,
  labResults,
  pets,
  users,
  type Analyte,
  type LabReport,
  type LabResult,
} from "../db/schema";
import { error, idParam, parseJson, type AppContext, type Authed } from "../http";
import { unknownFileError, unknownFiles, type AttachmentWithFile } from "./records";

export type LabResultRow = LabResult & Pick<Analyte, "code" | "name" | "category" | "sortOrder">;
export type LabReportWithResults = LabReport & {
  author: string;
  results: LabResultRow[];
  attachments: AttachmentWithFile[];
};

type Input = z.output<typeof labReportInput>;

const invalid = (fields: Record<string, string>) => error(400, "Some fields are invalid", fields);
const isUniqueViolation = (err: unknown) => err instanceof Error && /UNIQUE constraint failed/.test(err.message);

/** Checks the ids a report refers to; returns a 400 response naming the first bad one. */
function checkReferences(db: Db, petId: number, input: Input): Response | null {
  if (input.entryId) {
    const entry = db
      .select({ petId: entries.petId, kind: entries.kind })
      .from(entries)
      .where(eq(entries.id, input.entryId))
      .get();
    // Only a vet visit of this pet; the form offers nothing else.
    if (entry?.petId !== petId || entry.kind !== "vet") return invalid({ entryId: "Not a visit of this pet" });
  }
  const ids = input.results.map((r) => r.analyteId);
  const known = new Set(
    db
      .select({ id: analytes.id })
      .from(analytes)
      .where(inArray(analytes.id, ids))
      .all()
      .map((a) => a.id),
  );
  const unknown = ids.findIndex((id) => !known.has(id));
  if (unknown >= 0) return invalid({ [`results.${unknown}.analyteId`]: "Unknown test" });
  const fileIds = input.fileIds ?? [];
  if (unknownFiles(db, fileIds).length) return unknownFileError("fileIds");
  if (fileIds.length) {
    // A document must be a fresh upload or already one of this pet's files;
    // naming another pet's file would leak it onto this report.
    const attached = db
      .select({ fileId: attachments.fileId, petId: attachments.petId })
      .from(attachments)
      .where(inArray(attachments.fileId, fileIds))
      .all();
    const otherPets = new Set(attached.filter((a) => a.petId !== petId).map((a) => a.fileId));
    for (const a of attached) if (a.petId === petId) otherPets.delete(a.fileId);
    if (otherPets.size) return invalid({ fileIds: "Not this pet's file" });
  }
  return null;
}

/**
 * Saves a report with its results and documents in one transaction. Results
 * are matched by test and updated in place; documents always carry the
 * report's date. Omitting `fileIds` leaves the documents as they are.
 */
function saveReport(db: Db, petId: number, userId: number, input: Input, existingId?: number) {
  return db.transaction((tx) => {
    const { results, fileIds, ...fields } = input;
    const now = Date.now();
    const report = existingId
      ? tx
          .update(labReports)
          .set({ ...fields, updatedAt: now })
          .where(eq(labReports.id, existingId))
          .returning()
          .get()
      : tx
          .insert(labReports)
          .values({ ...fields, petId, createdBy: userId, createdAt: now, updatedAt: now })
          .returning()
          .get();
    if (!report) return undefined;

    const existing = tx.select().from(labResults).where(eq(labResults.reportId, report.id)).all();
    const wanted = new Set(results.map((r) => r.analyteId));
    for (const row of existing) {
      if (!wanted.has(row.analyteId)) tx.delete(labResults).where(eq(labResults.id, row.id)).run();
    }
    for (const result of results) {
      const values = { ...result, ...parseLabValue(result.valueText) };
      const current = existing.find((row) => row.analyteId === result.analyteId);
      if (current) tx.update(labResults).set(values).where(eq(labResults.id, current.id)).run();
      else
        tx.insert(labResults)
          .values({ ...values, reportId: report.id })
          .run();
    }

    tx.update(attachments).set({ date: report.date }).where(eq(attachments.labReportId, report.id)).run();
    if (fileIds) {
      const keep = new Set(fileIds);
      const attached = tx.select().from(attachments).where(eq(attachments.labReportId, report.id)).all();
      for (const a of attached) if (!keep.has(a.fileId)) tx.delete(attachments).where(eq(attachments.id, a.id)).run();
      const have = new Set(attached.map((a) => a.fileId));
      for (const fileId of keep) {
        if (have.has(fileId)) continue;
        tx.insert(attachments)
          .values({ petId, labReportId: report.id, fileId, date: report.date, createdBy: userId, createdAt: now })
          .run();
      }
    }
    return report;
  });
}

/** A pet's reports, newest first, with results in catalog order and their documents. */
export function petLabReports(db: Db, petId: number): LabReportWithResults[] {
  const rows = db
    .select({ report: labReports, author: users.name })
    .from(labReports)
    .innerJoin(users, eq(users.id, labReports.createdBy))
    .where(eq(labReports.petId, petId))
    .orderBy(desc(labReports.date), desc(labReports.id))
    .all();
  const results = db
    .select({
      result: labResults,
      code: analytes.code,
      name: analytes.name,
      category: analytes.category,
      sortOrder: analytes.sortOrder,
    })
    .from(labResults)
    .innerJoin(labReports, eq(labReports.id, labResults.reportId))
    .innerJoin(analytes, eq(analytes.id, labResults.analyteId))
    .where(eq(labReports.petId, petId))
    .orderBy(asc(analytes.sortOrder), asc(analytes.id))
    .all();
  const docs = db
    .select({
      a: attachments,
      author: users.name,
      file: {
        mime: files.mime,
        sizeBytes: files.sizeBytes,
        originalName: files.originalName,
        previewId: files.previewId,
      },
    })
    .from(attachments)
    .innerJoin(users, eq(users.id, attachments.createdBy))
    .innerJoin(files, eq(files.id, attachments.fileId))
    .where(and(eq(attachments.petId, petId), isNotNull(attachments.labReportId)))
    .orderBy(asc(attachments.id))
    .all();
  return rows.map(({ report, author }) => ({
    ...report,
    author,
    results: results
      .filter((r) => r.result.reportId === report.id)
      .map(({ result, ...analyte }) => ({ ...result, ...analyte })),
    attachments: docs
      .filter((d) => d.a.labReportId === report.id)
      .map(({ a, author, file }) => ({ ...a, author, file })),
  }));
}

export function labRoutes({ db }: AppContext, authed: Authed) {
  const petExists = (id: number) => !!db.select({ id: pets.id }).from(pets).where(eq(pets.id, id)).get();

  return {
    "/api/analytes": {
      GET: authed(() =>
        Response.json(db.select().from(analytes).orderBy(asc(analytes.sortOrder), asc(analytes.id)).all()),
      ),
      // A household's own test, added after the built-in ones.
      POST: authed(async (req) => {
        const parsed = await parseJson(req, analyteInput);
        if ("response" in parsed) return parsed.response;
        const last = db
          .select({ order: max(analytes.sortOrder) })
          .from(analytes)
          .get();
        try {
          const row = db
            .insert(analytes)
            .values({ ...parsed.data, sortOrder: (last?.order ?? 0) + 10 })
            .returning()
            .get();
          return Response.json(row, { status: 201 });
        } catch (err) {
          if (isUniqueViolation(err)) return invalid({ code: "Already in the catalog" });
          throw err;
        }
      }),
    },

    "/api/analytes/:id": {
      PUT: authed<"/api/analytes/:id">(async (req) => {
        const id = idParam(req.params.id);
        if (!id) return error(404, "Test not found");
        const parsed = await parseJson(req, analyteInput);
        if ("response" in parsed) return parsed.response;
        try {
          const row = db.update(analytes).set(parsed.data).where(eq(analytes.id, id)).returning().get();
          return row ? Response.json(row) : error(404, "Test not found");
        } catch (err) {
          if (isUniqueViolation(err)) return invalid({ code: "Already in the catalog" });
          throw err;
        }
      }),
      // Only a test no result uses; results keep their history.
      DELETE: authed<"/api/analytes/:id">((req) => {
        const id = idParam(req.params.id);
        if (!id) return error(404, "Test not found");
        const used = db.select({ id: labResults.id }).from(labResults).where(eq(labResults.analyteId, id)).get();
        if (used) return error(409, "Lab results use this test, so it can't be removed");
        const row = db.delete(analytes).where(eq(analytes.id, id)).returning().get();
        return row ? new Response(null, { status: 204 }) : error(404, "Test not found");
      }),
    },

    "/api/pets/:id/labs": {
      GET: authed<"/api/pets/:id/labs">((req) => {
        const petId = idParam(req.params.id);
        if (!petId || !petExists(petId)) return error(404, "Pet not found");
        return Response.json(petLabReports(db, petId));
      }),
      POST: authed<"/api/pets/:id/labs">(async (req, user) => {
        const petId = idParam(req.params.id);
        if (!petId || !petExists(petId)) return error(404, "Pet not found");
        const parsed = await parseJson(req, labReportInput);
        if ("response" in parsed) return parsed.response;
        const bad = checkReferences(db, petId, parsed.data);
        if (bad) return bad;
        return Response.json(saveReport(db, petId, user.id, parsed.data), { status: 201 });
      }),
    },

    "/api/labs/:id": {
      PUT: authed<"/api/labs/:id">(async (req, user) => {
        const id = idParam(req.params.id);
        const existing = id ? db.select().from(labReports).where(eq(labReports.id, id)).get() : undefined;
        if (!existing) return error(404, "Lab report not found");
        const parsed = await parseJson(req, labReportInput);
        if ("response" in parsed) return parsed.response;
        const bad = checkReferences(db, existing.petId, parsed.data);
        if (bad) return bad;
        return Response.json(saveReport(db, existing.petId, user.id, parsed.data, existing.id));
      }),
      DELETE: authed<"/api/labs/:id">((req) => {
        const id = idParam(req.params.id);
        const row = id ? db.delete(labReports).where(eq(labReports.id, id)).returning().get() : undefined;
        return row ? new Response(null, { status: 204 }) : error(404, "Lab report not found");
      }),
    },
  };
}
