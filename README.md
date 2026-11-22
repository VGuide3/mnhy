# Web3 Forge

Web3 Transaction Engineering & Compilation Studio. This repository is a TypeScript monorepo
managed with pnpm workspaces. It contains the dashboard, orchestration API, build worker, the
canonical transaction engine, the WebChunk runtime, and shared utilities.

## Prerequisites

- Node.js 18.18 or newer (CI covers Node 18 and 20)
- pnpm 9 (`corepack enable` or `npm install --global pnpm@9`)

## Quick start

```bash
pnpm install        # or: pnpm bootstrap
pnpm build          # type-check and compile every package with tsc -b
pnpm test           # run all Vitest suites
pnpm lint           # ESLint
pnpm format:check   # Prettier verification
```

## Root scripts

| Script            | Description                                             |
| ----------------- | ------------------------------------------------------- |
| `pnpm bootstrap`  | Install workspace dependencies                          |
| `pnpm build`      | Build every package through the composite project graph |
| `pnpm typecheck`  | Build sources and type-check all tests                  |
| `pnpm test`       | Run every package test once with Vitest                 |
| `pnpm test:watch` | Run Vitest in watch mode                                |
| `pnpm lint`       | Lint TypeScript, JavaScript, and config files           |
| `pnpm format`     | Format the repository with Prettier                     |
| `pnpm dev`        | Build, then start API, web, and worker in watch mode    |
| `pnpm clean`      | Remove TypeScript build output                          |

## Development servers

`pnpm dev` starts all three servers and a `tsc -b --watch` process. Each server restarts when
its compiled output changes.

| Service | Port | Command           | Health check                 |
| ------- | ---- | ----------------- | ---------------------------- |
| Web     | 3000 | `pnpm dev:web`    | `curl localhost:3000/health` |
| API     | 3001 | `pnpm dev:api`    | `curl localhost:3001/health` |
| Worker  | 3002 | `pnpm dev:worker` | `curl localhost:3002/health` |

The individual commands expect `pnpm build` to have run first. Override a port with `PORT`.

## Packages

### `@web3-forge/shared` (`packages/shared`)

Shared types, error codes, and utilities used by every other package. It has no dependencies.

```bash
pnpm --filter @web3-forge/shared build
```

### `@web3-forge/tx-engine` (`packages/tx-engine`)

Canonical transaction engine: strategy registration and the validate, simulate, authorize,
execute, and confirm lifecycle. Depends on `shared`. See
[`packages/tx-engine/README.md`](packages/tx-engine/README.md) for engine and strategy usage.

```bash
pnpm --filter @web3-forge/tx-engine build
pnpm --filter @web3-forge/tx-engine demo   # full native transfer flow
```

### `@web3-forge/runtime` (`packages/runtime`)

WebChunk runtime used by both the sandboxed preview and exported artifacts. Depends on
`shared` and `tx-engine`.

```bash
pnpm --filter @web3-forge/runtime build
```

### `@web3-forge/api` (`packages/api`)

Orchestration API for projects, builds, preview sessions, and auth. Depends on `shared`.

```bash
pnpm --filter @web3-forge/api build
pnpm --filter @web3-forge/api dev     # http://localhost:3001
```

### `@web3-forge/worker` (`packages/worker`)

Build worker that will run the esbuild pipeline and produce signed manifests. Depends on
`shared`.

```bash
pnpm --filter @web3-forge/worker build
pnpm --filter @web3-forge/worker dev  # http://localhost:3002
```

### `@web3-forge/web` (`packages/web`)

Desktop-first dashboard and transaction studio UI. Depends on `runtime`.

```bash
pnpm --filter @web3-forge/web build
pnpm --filter @web3-forge/web dev     # http://localhost:3000
```

## Testing

Vitest discovers every `packages/*/src/**/*.test.ts` file from the root configuration. The
config aliases `@web3-forge/*` imports to package sources, so tests run without a prior build.

```bash
pnpm test                 # all packages
pnpm test:watch           # watch mode
pnpm typecheck            # compile sources and type-check tests
```

## Toolchain notes

Vite is pinned to 6.4.6 through a pnpm override. Vitest 3 accepts Vite 7, but Vite 7 requires
Node 20.19 or newer while CI still covers Node 18.

## Repository layout

```text
.github/workflows/ci.yml   CI: install, format, lint, build, type-check, test on Node 18/20
packages/api               Orchestration API
packages/worker            Build worker
packages/web               Dashboard UI
packages/runtime           WebChunk runtime
packages/tx-engine         Transaction engine
packages/shared            Shared types and utilities
scripts/dev.mjs            Runs the three dev servers and tsc watch
```

## CI

`.github/workflows/ci.yml` runs on pushes to `main` and on pull requests. The matrix covers
Node 18 and 20 and executes install, format check, lint, build, test type-check, and tests.

## Security

Do not commit secrets. `.gitignore` excludes `.env` files, build output, and coverage data.
RPC credentials and signing keys belong in the deployment secret manager, never in source or
build artifacts.
