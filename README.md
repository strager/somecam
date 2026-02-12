# SoMeCaM

This is an application for facilitating the Sources of Meaning Card Method,
helping people discover what is meaningful in their life.

Citation: Presentation of the Sources of Meaning Card Method: The SoMeCaM, by
Peter la Cour and Tatjana Schnell, 2016

## Technical details

- Web-based app
- TypeScript
- Vite
- Vitest
- npm
- Frontend:
  - Vue.js 3
  - Vue Router
- Backend:
  - Node.js v24
  - openapi-backend <https://www.npmjs.com/package/openapi-backend> with request
    and response validation

## Runbook

```bash
npm ci
npm run typecheck
npm test
npm run dev
```

Then open: <http://localhost:3011/>
