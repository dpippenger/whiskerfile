import type { Units } from "../../shared/records";
import { useMe } from "./queries";

/** US English readers get pounds and Fahrenheit by default; everyone else metric. */
export function localeUnits(language = navigator.language): Units {
  return language === "en-US" ? { weight: "lb", temperature: "f" } : { weight: "kg", temperature: "c" };
}

/** The signed-in user's display units, falling back to the browser's locale. */
export function useUnits(): Units {
  const me = useMe().data;
  const fallback = localeUnits();
  return {
    weight: me?.weightUnit ?? fallback.weight,
    temperature: me?.temperatureUnit ?? fallback.temperature,
  };
}
