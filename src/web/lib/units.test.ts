import { expect, test } from "bun:test";
import { localeUnits } from "./units";

test("US English readers start with pounds and Fahrenheit, everyone else metric", () => {
  expect(localeUnits("en-US")).toEqual({ weight: "lb", temperature: "f" });
  for (const language of ["en-GB", "en", "de-DE", "es-US", ""]) {
    expect(localeUnits(language)).toEqual({ weight: "kg", temperature: "c" });
  }
});
