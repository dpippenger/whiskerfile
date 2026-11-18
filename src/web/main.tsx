import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { Route, Switch } from "wouter";
import { AppShell } from "./components/app-shell";
import { Page } from "./components/page";
import { Dashboard } from "./routes/dashboard";
import { Settings } from "./routes/settings";

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <AppShell>
      <Switch>
        <Route path="/" component={Dashboard} />
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
