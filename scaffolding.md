# Plan: SoMeCaM Project Scaffolding

## Context

The project directory is empty except for `README.md`. We need to create the initial "hello world" scaffolding: a Node.js backend serving an OpenAPI-validated `/api/health` endpoint, and a Vue.js frontend that queries it on page load. The backend embeds Vite in middleware mode so only one host:port is exposed to the browser.

## Architecture Decisions

- **Vite in middleware mode**: The backend embeds Vite's dev server as Express middleware. Single process, no CORS, HMR works automatically.
- **Express** as the HTTP framework: Vite's middleware mode produces Connect-compatible middleware that plugs into Express. openapi-backend docs show Express examples.
- **Node.js v24 native TypeScript**: No tsx/ts-node needed. Backend runs directly via `node`. Requires `erasableSyntaxOnly: true` (no enums, no parameter properties).
- **API path prefix**: OpenAPI paths are defined without the `/api` prefix (for example `/health`). Express mounts the OpenAPI handler at `/api`, so browser requests use `/api/health`.
- **Request + response validation**: openapi-backend validates incoming requests and outgoing responses against the OpenAPI spec.
- **Validation error format**: Request-validation failures return `application/problem+json` following RFC 9457 with this minimal shape:
  - `type` (string URI, use `about:blank` initially)
  - `title` (short human-readable summary)
  - `status` (HTTP status code)
  - `detail` (specific validation message)
  - `errors` (optional array extension with per-field validation details)

## File Structure

```text
package.json
tsconfig.json                 # base config
tsconfig.backend.json         # backend: erasableSyntaxOnly, Node types
tsconfig.frontend.json        # frontend: bundler resolution, vite/client types
vite.config.ts
vitest.config.ts
openapi.yaml                  # OpenAPI 3.1 spec (defines GET /health)
backend/
  app.ts                      # Express app factory and middleware wiring
  main.ts                     # dev entrypoint: create app, attach Vite middleware, listen
  api.ts                      # openapi-backend setup and handlers
frontend/
  index.html                  # Vite HTML entrypoint
  main.ts                     # createApp, mount router, Vue Router with history mode
  App.vue                     # <RouterView />
  env.d.ts                    # .vue shim + vite/client reference
  HomeView.vue                # fetches /api/health on mount, displays result
```

## Dependencies

**Production:** `express`, `openapi-backend`, `vue`, `vue-router`
**Dev:** `typescript`, `vite`, `vitest`, `@vitejs/plugin-vue`, `@types/express`, `@types/node`, `vue-tsc`

## Implementation Steps

### 1. Create `package.json` and install deps

- `"type": "module"`, private, scripts:
  - `dev`: `node --watch backend/main.ts`
  - `typecheck`: checks both backend and frontend tsconfigs
  - `test`: `vitest`
- Run `npm install`

### 2. Create TypeScript configs

- `tsconfig.json`: base — strict, ESNext target, NodeNext module, noEmit, verbatimModuleSyntax, isolatedModules
- `tsconfig.backend.json`: extends base — `erasableSyntaxOnly`, `rewriteRelativeImportExtensions`, Node types, includes backend + Node-side config files
- `tsconfig.frontend.json`: extends base — module ESNext, moduleResolution bundler, includes frontend

### 3. Create `openapi.yaml`

- OpenAPI 3.1.0 spec defining `GET /health` with operationId `getHealth`
- Success response schema: `{status: "ok"}`
- Error schema/content for `application/problem+json` (for validation failures and other API errors)

### 4. Create backend files

- `backend/api.ts`
  - creates openapi-backend instance
  - registers handlers + error handlers
  - `getHealth` handler returns `{status: "ok"}`
  - `validationFail` handler returns RFC 9457 `application/problem+json` with status `400`
  - response is sent through openapi-backend's `postResponseHandler` so response validation is enforced
- `backend/app.ts`
  - exports `createApp()` that builds and returns an Express app
  - mounts OpenAPI handler at `/api`
  - applies JSON/body middleware needed by API handlers
- `backend/main.ts`
  - creates app via `createApp()`
  - creates Vite in middleware mode and attaches `vite.middlewares`
  - listens on port `3011`

### 5. Create Vite + Vitest configs

- `vite.config.ts`: vue plugin, `root: "frontend"` for `frontend/index.html`
- `vitest.config.ts`: vue plugin, node environment

### 6. Create frontend files

- `frontend/index.html`: root div and module script loading `./main.ts`
- `frontend/env.d.ts`: vue shim + vite/client types
- `frontend/main.ts`
  - createApp + router + mount
  - createWebHistory
  - routes: `/` -> HomeView
- `frontend/App.vue`: just `<RouterView />`
- `frontend/HomeView.vue`: heading, fetches `/api/health` on mount, shows status/error/loading

### 7. Add a basic test

- `backend/api.test.ts`: starts app on a random local port (without Vite), calls `/api/health` via `fetch`, asserts status 200 and body `{status: "ok"}`
- Add one negative test: invalid API request returns `application/problem+json` with RFC 9457 fields

## Verification

1. `npm run dev` — open http://localhost:3011, confirm page shows "API Health: ok"
2. `curl http://localhost:3011/api/health` — returns `{"status":"ok"}`
3. Send a malformed API request and confirm `application/problem+json` response structure
4. `npm test` — health test and validation error test pass
5. `npm run typecheck` — no type errors
