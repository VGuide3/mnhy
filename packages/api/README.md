# @web3-forge/api

Fastify orchestration API for the Web3 Forge POC. It exposes health, transaction validation and
simulation, and in-memory project/build endpoints. There is no database or Redis at this step.

## Run

```bash
pnpm --filter @web3-forge/api build
pnpm --filter @web3-forge/api start
```

The server listens on `PORT` (default `3001`) and `HOST` (default `0.0.0.0`).

```bash
curl http://localhost:3001/health
```

## Endpoints

### `GET /health`

```json
{ "status": "ok" }
```

### `POST /api/tx/validate`

Accepts `{ strategy, params }` and returns the engine's `ValidationResult`. The API creates a
fresh engine per request, so validation does not leak state between calls.

```bash
curl -s http://localhost:3001/api/tx/validate \
  -H 'content-type: application/json' \
  -d '{
    "strategy": "nativeTransfer",
    "params": {
      "to": "0x000000000000000000000000000000000000dEaD",
      "value": "1000000000000000000"
    }
  }'
```

```json
{ "ok": true }
```

Invalid parameters return `200` with `{ "ok": false, "errors": [...] }`. A missing strategy
returns `400`. An unknown strategy returns `404` with code `STRATEGY_NOT_FOUND`.

### `POST /api/tx/simulate`

Accepts either `{ encodedTx, chainId?, simulationMode?, strategy? }` or a bare `EncodedTx`.
The native transfer strategy is used when no strategy is supplied.

```bash
curl -s http://localhost:3001/api/tx/simulate \
  -H 'content-type: application/json' \
  -d '{
    "encodedTx": {
      "to": "0x000000000000000000000000000000000000dEaD",
      "data": "0x",
      "value": "0xde0b6b3a7640000"
    },
    "chainId": 1
  }'
```

```json
{ "ok": true, "gasUsed": "21000" }
```

`gasUsed` is a bigint in the engine. It is serialized as a decimal string because JSON has no
bigint type. Reverts return `200` with `{ "ok": false, "revertReason": "..." }`.

### `POST /api/projects`

Creates an in-memory project and returns its ID.

```bash
curl -s http://localhost:3001/api/projects \
  -H 'content-type: application/json' \
  -d '{ "name": "Demo project" }'
```

```json
{
  "projectId": "proj_...",
  "project": {
    "projectId": "proj_...",
    "name": "Demo project",
    "createdAt": "2026-11-22T00:00:00.000Z"
  }
}
```

`GET /api/projects/:projectId` returns the project or `404`.

### `POST /api/projects/:projectId/builds`

Enqueues a build job in the in-memory queue and returns the new build ID.

```bash
curl -s -X POST http://localhost:3001/api/projects/proj_.../builds
```

```json
{ "buildId": "bld_...", "status": "queued", "queuePosition": 1 }
```

`GET /api/builds/:buildId` returns the build record. The build remains `queued` because this POC
does not run a queue consumer inside the API process.

## Tests

From the repository root:

```bash
pnpm test
pnpm typecheck
```

`src/app.test.ts` uses Fastify `inject` and covers health, valid and invalid transaction
validation, simulation, project creation, build enqueueing, and 404 behavior.

## POC limits

- Projects and builds live in process memory and disappear on restart.
- The build queue is in-memory. A Redis-backed queue can replace `InMemoryBuildQueue` later.
- Only the `nativeTransfer` strategy is registered.
- No auth, database, object storage, or CORS configuration yet.
