import { expect, test } from "bun:test";
import { isEmail, isPhone, telHref, vetInput, vetLabel } from "./vets";

const blank = { name: "Dr. Okafor", clinic: "", phone: "", email: "", address: "", website: "", notes: "" };
const fields = (input: object) => (vetInput.safeParse(input).error?.issues ?? []).map((i) => i.path.join("."));

test("only the name is required, and blank details are stored as null", () => {
  expect(vetInput.parse({ ...blank, name: "  Dr. Okafor " })).toEqual({
    name: "Dr. Okafor",
    clinic: null,
    phone: null,
    email: null,
    address: null,
    website: null,
    notes: null,
  });
  expect(fields({ ...blank, name: "  " })).toEqual(["name"]);
  expect(fields({ ...blank, name: "x".repeat(121) })).toEqual(["name"]);
});

test("details are trimmed and kept as typed", () => {
  expect(
    vetInput.parse({
      name: "Dr. Okafor",
      clinic: " Northside Animal Hospital ",
      phone: " +1 (555) 010-0199 x12 ",
      email: " front.desk@northside.example ",
      address: "12 Elm Street\nSpringfield",
      website: "https://northside.example/",
      notes: "Closed Sundays",
    }),
  ).toEqual({
    name: "Dr. Okafor",
    clinic: "Northside Animal Hospital",
    phone: "+1 (555) 010-0199 x12",
    email: "front.desk@northside.example",
    address: "12 Elm Street\nSpringfield",
    website: "https://northside.example/",
    notes: "Closed Sundays",
  });
});

test("each detail has a length limit", () => {
  expect(fields({ ...blank, clinic: "x".repeat(121) })).toEqual(["clinic"]);
  expect(fields({ ...blank, address: "x".repeat(301) })).toEqual(["address"]);
  expect(fields({ ...blank, notes: "x".repeat(2001) })).toEqual(["notes"]);
  expect(fields({ ...blank, phone: "5".repeat(41) })).toEqual(["phone"]);
  expect(fields({ ...blank, email: `${"x".repeat(250)}@a.io` })).toEqual(["email"]);
});

test("a phone needs digits and only the punctuation numbers are written with", () => {
  for (const ok of ["555 010 0199", "+44 20 7946 0958", "(555) 010-0199", "555.010.0199", "020/7946 0958", "112"]) {
    expect(isPhone(ok)).toBe(true);
  }
  for (const ok of ["555-0199 x12", "555-0199 ext. 12", "555-0199 EXT 12", "555-0199x12"])
    expect(isPhone(ok)).toBe(true);
  for (const bad of ["call the desk", "55", "555-0199 or 555-0100", "+", "555 0199 x", "x12", "5+55 0199"]) {
    expect(isPhone(bad)).toBe(false);
  }
  expect(fields({ ...blank, phone: "ask at reception" })).toEqual(["phone"]);
});

test("an email is one address with a domain", () => {
  for (const ok of ["desk@northside.example", "a.b+c@sub.vets.co.uk"]) expect(isEmail(ok)).toBe(true);
  for (const bad of ["desk", "desk@northside", "desk@.example", "a@b.example, c@d.example", "a b@c.example", "@c.io"]) {
    expect(isEmail(bad)).toBe(false);
  }
  expect(fields({ ...blank, email: "desk@northside" })).toEqual(["email"]);
});

test("a website is a full http(s) address", () => {
  expect(fields({ ...blank, website: "northside.example" })).toEqual(["website"]);
  expect(fields({ ...blank, website: "javascript:alert(1)" })).toEqual(["website"]);
  expect(fields({ ...blank, website: "http://northside.example" })).toEqual([]);
});

test("a phone link keeps the digits, a leading plus and the extension", () => {
  expect(telHref("+1 (555) 010-0199")).toBe("tel:+15550100199");
  expect(telHref("555.010.0199")).toBe("tel:5550100199");
  expect(telHref("555-0199 ext. 12")).toBe("tel:5550199;ext=12");
  expect(telHref("555-0199x7")).toBe("tel:5550199;ext=7");
});

test("a vet is named with its clinic when it has one", () => {
  expect(vetLabel({ name: "Dr. Okafor", clinic: "Northside Animal Hospital" })).toBe(
    "Dr. Okafor · Northside Animal Hospital",
  );
  expect(vetLabel({ name: "Northside Animal Hospital", clinic: null })).toBe("Northside Animal Hospital");
});
