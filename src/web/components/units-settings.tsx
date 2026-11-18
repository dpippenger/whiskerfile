import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "../../server/db/schema";
import { api } from "../lib/api";
import { useMe } from "../lib/queries";
import { localeUnits } from "../lib/units";
import { Card } from "./ui/card";
import { Field, Select } from "./ui/field";

/** Each person's display units; stored values never change. */
export function UnitsSettings() {
  const me = useMe();
  const queryClient = useQueryClient();
  const auto = localeUnits();
  const save = useMutation({
    mutationFn: (body: Pick<User, "weightUnit" | "temperatureUnit">) => api<User>("/me", { method: "PATCH", body }),
    onSuccess: (user) => queryClient.setQueryData(["me"], user),
  });
  if (!me.data) return null;
  const current = { weightUnit: me.data.weightUnit, temperatureUnit: me.data.temperatureUnit };

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Units</h2>
        <p className="text-muted-foreground">How weights and temperatures are shown and typed. Only affects you.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Weight" htmlFor="unit-weight">
          <Select
            id="unit-weight"
            value={current.weightUnit ?? ""}
            disabled={save.isPending}
            onChange={(e) => save.mutate({ ...current, weightUnit: (e.target.value || null) as User["weightUnit"] })}
          >
            <option value="">Automatic ({auto.weight === "lb" ? "pounds" : "kilograms"})</option>
            <option value="lb">Pounds (lb)</option>
            <option value="kg">Kilograms (kg)</option>
          </Select>
        </Field>
        <Field label="Temperature" htmlFor="unit-temperature">
          <Select
            id="unit-temperature"
            value={current.temperatureUnit ?? ""}
            disabled={save.isPending}
            onChange={(e) =>
              save.mutate({ ...current, temperatureUnit: (e.target.value || null) as User["temperatureUnit"] })
            }
          >
            <option value="">Automatic ({auto.temperature === "f" ? "°F" : "°C"})</option>
            <option value="f">Fahrenheit (°F)</option>
            <option value="c">Celsius (°C)</option>
          </Select>
        </Field>
      </div>
      {save.error && <p className="text-danger">{save.error.message}</p>}
    </Card>
  );
}
