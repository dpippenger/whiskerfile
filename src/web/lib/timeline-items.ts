import { formatDate } from "../../shared/dates";
import type { PetHealth } from "../../server/routes/health";
import type { LabReportWithResults } from "../../server/routes/labs";
import type {
  AttachmentWithFile,
  EntryWithVitals,
  MeasurementWithAuthor,
  PetRecords,
} from "../../server/routes/records";

type Dated = { date: string; createdAt: number };
export type TimelineItem = Dated &
  (
    | { type: "entry"; entry: EntryWithVitals }
    | { type: "measurement"; measurement: MeasurementWithAuthor }
    | { type: "file"; attachment: AttachmentWithFile }
    | { type: "lab"; report: LabReportWithResults }
    | { type: "vaccination"; record: PetHealth["vaccinations"][number] }
    | { type: "medication"; record: PetHealth["medications"][number] }
    | { type: "condition"; record: PetHealth["conditions"][number] }
  );

/**
 * Visits, standalone readings and files, lab reports, vaccine doses, the start
 * of each medication and each condition in one list, newest day first, newest
 * entry first within a day.
 */
export function timelineItems(records: PetRecords, labs: LabReportWithResults[], health: PetHealth): TimelineItem[] {
  const items: TimelineItem[] = [
    ...records.entries.map((entry) => ({
      type: "entry" as const,
      date: entry.date,
      createdAt: entry.createdAt,
      entry,
    })),
    ...records.measurements.map((measurement) => ({
      type: "measurement" as const,
      date: measurement.date,
      createdAt: measurement.createdAt,
      measurement,
    })),
    ...records.attachments.map((attachment) => ({
      type: "file" as const,
      date: attachment.date,
      createdAt: attachment.createdAt,
      attachment,
    })),
    ...labs.map((report) => ({ type: "lab" as const, date: report.date, createdAt: report.createdAt, report })),
    ...health.vaccinations.map((record) => ({
      type: "vaccination" as const,
      date: record.dateGiven,
      createdAt: record.createdAt,
      record,
    })),
    ...health.medications.map((record) => ({
      type: "medication" as const,
      date: record.startDate,
      createdAt: record.createdAt,
      record,
    })),
    ...health.conditions.map((record) => ({
      type: "condition" as const,
      date: record.date,
      createdAt: record.createdAt,
      record,
    })),
  ];
  return items.sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
}

/** "Started Nov 6, 2026, until Dec 6, 2026", worded for whether each date has passed. */
export function medicationDates(m: { startDate: string; endDate: string | null }, today: string): string {
  const start = `${m.startDate > today ? "Starts" : "Started"} ${formatDate(m.startDate)}`;
  if (!m.endDate) return start;
  return `${start}, ${m.endDate < today ? "stopped" : "until"} ${formatDate(m.endDate)}`;
}
