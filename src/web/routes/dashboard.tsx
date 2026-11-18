import { PawPrint } from "lucide-react";
import { Page } from "../components/page";
import { Card } from "../components/ui/card";

export function Dashboard() {
  return (
    <Page title="Pets">
      <Card className="flex flex-col items-center gap-3 py-16 text-center">
        <PawPrint className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-base font-semibold">No pets yet</p>
        <p className="max-w-sm text-muted-foreground">Pet profiles and records arrive in the next phase.</p>
      </Card>
    </Page>
  );
}
