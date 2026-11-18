import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { Route, Switch } from "wouter";
import { AppShell } from "./components/app-shell";
import { Page } from "./components/page";
import { Dashboard } from "./routes/dashboard";
import { EditPet, NewPet } from "./routes/pet-form";
import { PetProfile } from "./routes/pet-profile";
import { Settings } from "./routes/settings";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <AppShell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/pets/new" component={NewPet} />
        <Route path="/pets/:id/edit">{({ id }) => <EditPet key={id} id={Number(id)} />}</Route>
        <Route path="/pets/:id">{({ id }) => <PetProfile id={Number(id)} />}</Route>
        <Route path="/pets/:id/weight">{({ id }) => <PetProfile id={Number(id)} tab="weight" />}</Route>
        <Route path="/settings" component={Settings} />
        <Route>
          <Page title="Page not found">
            <p className="text-muted-foreground">There is nothing at this address.</p>
          </Page>
        </Route>
      </Switch>
    </AppShell>
  </QueryClientProvider>,
);
