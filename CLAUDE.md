# Whiskerfile

Self-hosted pet medical records app. One Bun process serves the JSON API and the React single-page app.

- `src/server/`: `Bun.serve` routes, Cloudflare Access auth, SQLite (Drizzle), backups.
- `src/web/`: React app. Tailwind v4 tokens live in `src/web/index.css`; the UI is dark only.
- `src/shared/`: code used by both sides.
- `drizzle/`: generated migrations. After changing `src/server/db/schema.ts` run `bun run db:generate` and commit the result; migrations apply at startup.
- Every `/api/*` handler must be wrapped in `authed()` (`src/server/http.ts`), and each new route added to the 401 lists in `src/server/app.test.ts`.
- Pure logic shared by server and browser (dates, units, validation) lives in `src/shared/` with its own tests.
- Run `bun run format` before committing, so review fix commits never carry reformatting.
- Every screen must work on both desktop and phone widths; check both before finishing UI work.
- The production image runs from source (`development: false` bundles the frontend at first request) because the `bun build` CLI does not apply the Tailwind plugin from `bunfig.toml`.
- Client routing uses `wouter`. TanStack Router crashes under Bun's hot-reload module format (a circular import inside router-core), so do not switch back without checking `bun run dev` in a browser.
- `bun run dev` starts a local server with `AUTH_MODE=dev`; `bun test` and `bun check` must pass before committing, and `bun lint` where the installed Bun has it (canary only so far; CI runs it).
- CI (`.github/workflows/ci.yml`) gates every pull request on the `ci-gate` check; the README lists the commands behind each job. Pin actions to a commit SHA, and bump `.bun-version` together with the `Dockerfile`.

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun check` instead of `tsc --noEmit`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Type checking

Use `bun check` to type check the project. It reads `tsconfig.json` and reports the same errors as `tsc`.

- `bun check src/index.ts` checks one file and what it imports
- `bun --check src/index.ts`, `bun test --check` and `bun build --check` type check first, and do nothing else if there is an error

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.
