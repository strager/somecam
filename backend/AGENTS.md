## Coding style

- Use explicit `.ts` extensions for local backend imports.

## API Design

- Endpoints accept IDs (e.g. `cardId`, `questionId`) and look up data server-side from shared modules.
- Do NOT pass raw card/question text from frontend to backend when an ID would suffice.
- Follow existing endpoint patterns in `backend/api.ts` when adding new endpoints.
- Never forward raw JavaScript error messages or third-party API error messages to clients. Return sanitized `application/problem+json` details instead.

## Testing

- Prefer MSW (`msw`) for mocking HTTP requests over `vi.spyOn(globalThis, "fetch")` when possible.

## LLM Integration

- Backend proxies LLM calls to X AI (grok models).
- LLM client lives in `backend/xai-client.ts`; API key loaded from `.env`.
