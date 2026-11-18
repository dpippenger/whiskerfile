import { expect, test } from "bun:test";
import {
  editedValue,
  entryInput,
  formatVital,
  fromCelsius,
  fromGrams,
  measurementInput,
  toCelsius,
  toGrams,
} from "./records";

test("weights round-trip at display precision in both units", () => {
  for (let hundredths = 50; hundredths <= 3000; hundredths += 7) {
    const lb = hundredths / 100;
    expect(fromGrams(toGrams(lb, "lb"), "lb")).toBe(lb);
    expect(fromGrams(toGrams(lb, "kg"), "kg")).toBe(lb);
  }
  expect(toGrams(10.25, "lb")).toBe(4649);
  expect(fromGrams(4649, "kg")).toBe(4.65);
});

test("temperatures round-trip at display precision in both units", () => {
  for (let tenths = 950; tenths <= 1080; tenths++) {
    const f = tenths / 10;
    expect(fromCelsius(toCelsius(f, "f"), "f")).toBe(f);
  }
  expect(fromCelsius(toCelsius(38.6, "c"), "c")).toBe(38.6);
  expect(toCelsius(101.5, "f")).toBe(38.61);
});

test("vitals are shown in the reader's units", () => {
  const imperial = { weight: "lb", temperature: "f" } as const;
  const metric = { weight: "kg", temperature: "c" } as const;
  expect(formatVital("weight", 4649, imperial)).toBe("10.25 lb");
  expect(formatVital("weight", 4649, metric)).toBe("4.65 kg");
  expect(formatVital("temperature", 38.61, imperial)).toBe("101.5 °F");
  expect(formatVital("temperature", 38.61, metric)).toBe("38.6 °C");
  expect(formatVital("heart_rate", 180, metric)).toBe("180 bpm");
  expect(formatVital("body_condition", 5, metric)).toBe("5/9");
});

test("implausible readings are refused", () => {
  const entry = (vitals: object) =>
    entryInput.safeParse({ kind: "home", date: "2026-11-01", clinic: "", vet: "", reason: "", notes: "", vitals })
      .error?.issues.map((i) => i.path.join("."));
  expect(entry({ weight: 4649, temperature: 38.6 })).toBeUndefined();
  expect(entry({ temperature: 101.5 })).toEqual(["vitals.temperature"]);
  expect(entry({ body_condition: 5.5 })).toEqual(["vitals.body_condition"]);
  expect(entry({ weight: 0 })).toEqual(["vitals.weight"]);

  expect(measurementInput.safeParse({ date: "2026-11-01", kind: "weight", value: 4649 }).success).toBe(true);
  expect(measurementInput.safeParse({ date: "2026-11-01", kind: "weight", value: 4649.5 }).success).toBe(false);
  expect(measurementInput.safeParse({ date: "2026-11-31", kind: "weight", value: 4649 }).success).toBe(false);
});

test("a reading left as shown keeps its stored value; an edited one is converted", () => {
  const inLb = (n: number) => toGrams(n, "lb");
  const inKg = (n: number) => toGrams(n, "kg");
  // 4650 g is shown as 10.25 lb, which converts back to 4649 g.
  const lb = String(fromGrams(4650, "lb"));
  expect(editedValue(lb, lb, 4650, inLb)).toBe(4650);
  expect(inLb(Number(lb))).toBe(4649);
  const kg = String(fromGrams(4125, "kg"));
  expect(editedValue(kg, kg, 4125, inKg)).toBe(4125);
  // 38.61 °C is shown as 38.6 °C and 101.5 °F.
  for (const unit of ["c", "f"] as const) {
    const shown = String(fromCelsius(38.61, unit));
    expect(editedValue(shown, shown, 38.61, (n) => toCelsius(n, unit))).toBe(38.61);
  }

  expect(editedValue("10.3", lb, 4650, inLb)).toBe(toGrams(10.3, "lb"));
  expect(editedValue("", lb, 4650, inLb)).toBeNull();
  expect(editedValue("abc", lb, 4650, inLb)).toBeNaN();
  expect(editedValue("4,5", "", undefined, inKg)).toBe(4500);
  // A new reading has no stored value and is always converted.
  expect(editedValue("10.25", "10.25", undefined, inLb)).toBe(4649);
});
