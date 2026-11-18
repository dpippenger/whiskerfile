import { expect, test } from "bun:test";
import { entryInput, formatVital, fromCelsius, fromGrams, measurementInput, toCelsius, toGrams } from "./records";

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
