import { useEffect, useState } from "react";
import { localToday } from "../../shared/dates";

/**
 * The browser's date, kept current while the page stays open: checked each
 * minute and whenever the tab is shown again, so midnight moves "today".
 */
export function useLocalToday(): string {
  const [today, setToday] = useState(localToday);
  useEffect(() => {
    const check = () => setToday(localToday());
    const timer = setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return today;
}
