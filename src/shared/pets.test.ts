import { expect, test } from "bun:test";
import { CHART_COLORS, chipRegistryInput, nextChartColor, petInput, reproductiveLabel } from "./pets";

const base = {
  name: "Miso",
  species: "cat",
  breed: "",
  sex: "female",
  reproductive: "altered",
  dob: "2019-04-02",
  dobEstimated: false,
  coatColor: "",
  eyeColor: "",
  microchip: "",
  chipRegistryId: null,
  photoFileId: null,
  notes: "",
  deceasedOn: "",
};

test("blank optional fields are stored as null", () => {
  const pet = petInput.parse({ ...base, name: "  Miso  " });
  expect(pet).toMatchObject({ name: "Miso", breed: null, coatColor: null, deceasedOn: null, microchip: null });
});

test("invalid pets are rejected with the offending field", () => {
  const errors = (input: object) =>
    petInput.safeParse({ ...base, ...input }).error?.issues.map((i) => i.path.join("."));
  expect(errors({ name: " " })).toEqual(["name"]);
  expect(errors({ dob: "2019-02-30" })).toEqual(["dob"]);
  expect(errors({ species: "dragon" })).toEqual(["species"]);
  expect(errors({ deceasedOn: "2018-01-01" })).toEqual(["deceasedOn"]);
  expect(errors({ chartColor: "#123456" })).toEqual(["chartColor"]);
  // Birth and passing dates have already happened.
  expect(errors({ dob: "2999-01-01" })).toEqual(["dob"]);
  expect(errors({ deceasedOn: "2999-01-01" })).toEqual(["deceasedOn"]);
});

test("new pets get the least used chart colour", () => {
  expect(nextChartColor([])).toBe(CHART_COLORS[0]);
  expect(nextChartColor([CHART_COLORS[0]])).toBe(CHART_COLORS[1]);
  expect(nextChartColor([...CHART_COLORS, CHART_COLORS[0]])).toBe(CHART_COLORS[1]);
});

test("spay or neuter wording follows the sex", () => {
  expect(reproductiveLabel("altered", "female")).toBe("Spayed");
  expect(reproductiveLabel("altered", "male")).toBe("Neutered");
  expect(reproductiveLabel("intact", "male")).toBe("Intact");
});

test("registry websites must be full addresses", () => {
  expect(chipRegistryInput.safeParse({ name: "X", website: "example.com", phone: "" }).success).toBe(false);
  expect(chipRegistryInput.parse({ name: "X", website: "", phone: "" })).toEqual({
    name: "X",
    website: null,
    phone: null,
  });
});

test("registry websites must be addresses the browser can open", () => {
  const ok = (website: string) => chipRegistryInput.safeParse({ name: "X", website, phone: "" }).success;
  expect(ok("https://www.akcreunite.org")).toBe(true);
  expect(ok("http://localhost:8080/path")).toBe(true);
  for (const bad of [
    "https://?",
    "https://example.com:abc",
    "https://[x]",
    "http://%",
    "javascript:alert(1)",
    "ftp://x.org",
  ]) {
    expect(ok(bad)).toBe(false);
  }
});
