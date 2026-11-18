import { eq } from "drizzle-orm";
import { parseLabValue } from "../../shared/labs";
import type { Db } from ".";
import { labResults } from "./schema";

/**
 * Re-reads every stored lab result's number and comparator from its printed
 * text, so results saved under an older reading rule (such as "-1" before
 * negative numbers were read) match the current one. Changes only rows that
 * differ, so running it again does nothing. Returns how many rows changed.
 */
export function reparseLabResults(db: Db): number {
  let changed = 0;
  db.transaction((tx) => {
    for (const row of tx.select().from(labResults).all()) {
      const { value, comparator } = parseLabValue(row.valueText);
      if (value === row.value && comparator === row.comparator) continue;
      tx.update(labResults).set({ value, comparator }).where(eq(labResults.id, row.id)).run();
      changed++;
    }
  });
  return changed;
}
