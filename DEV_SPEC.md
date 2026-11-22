# WEB3 FORGE — Developer Specification (MVP)

Version: 0.1 — Draft  
Audience: Frontend, Backend, Infra engineers, QA, Security reviewers

This developer specification translates the one‑pager into a concrete, developer‑ready plan. It includes functional and non‑functional requirements, architecture choices, module interfaces, data models, APIs, error handling, security constraints, and a testing plan so a developer can begin implementation immediately.

Table of contents
- 1. Goals & Scope (MVP)
- 2. Non‑Functional Requirements & Constraints
- 3. High‑Level Architecture
- 4. Component & Module Specifications
  - 4.1 Project Studio
  - 4.2 Script Compiler (server esbuild pipeline)
  - 4.3 Wallet Studio (adapters)
  - 4.4 Transaction Builder
  - 4.5 Modal Designer & Registry
  - 4.6 TransactionEngine (canonical)
  - 4.7 WebChunk Runtime (preview + exported runtime)
  - 4.8 Preview Engine (sandbox)
  - 4.9 Artifact Center & Build Workers
  - 4.10 Auth & Orchestration API
- 5. Data Models & Persistence
  - 5.1 Postgres schemas (core)
  - 5.2 Redis (queues & ephemeral state)
  - 5.3 S3 artifact layout & manifest schema
  - 5.4 KMS usage & secrets policy
- 6. APIs (server) — Endpoints & payloads
- 7. Transaction Flow & State Machine
- 8. Simulation Modes & Viem / Anvil usage
- 9. Error Handling & Retry Strategies
- 10. Security & Sandbox Design
- 11. Testing Plan (unit, integration, E2E, fuzz)
- 12. Observability, Metrics, Logging & Alerts
- 13. CI/CD and Deployment
- 14. Acceptance Criteria & Success Metrics
- 15. Roadmap, Milestones & Rough Estimates
- 16. Developer onboarding & checklist
- 17. Appendix: Interfaces, Types & Example Payloads

---

1. Goals & Scope (MVP)
- Deliver a desktop‑first web application and server build API that enables:
  - Edit/compile JavaScript transaction scripts & ABIs.
  - Live sandbox preview bound to the same runtime as exported artifacts.
  - Compose transactions (native, ERC‑20 transfer/approval, contract write, Multicall3).
  - Simulate, validate, authorize via wallet, submit and confirm on chain.
  - Produce reproducible server esbuild artifacts (IIFE + ESM) and signed manifests.
- Exclusions for MVP:
  - No custom JS modal templates (templates-only knobs).
  - No embedded private keys, no fake transactions or fake wallet flows.
  - Mobile is read-only.

2. Non‑Functional Requirements & Constraints
- Security:
  - Never store or export private keys / seed phrases.
  - RPC credentials and relayer secrets encrypted in KMS and only available in build workers at runtime; never included in published artifacts.
  - Signed manifests and immutable integrity hashes for artifacts.
  - Preview must be sandboxed and cannot access server secrets.
- Performance:
  - Build timeout default: 120s.
  - Target small project (<50 KB) build latency: <5s under normal load.
- Scale & Limits:
  - Artifact size limit: 50 MB (configurable).
  - Initial supported chains: Ethereum Mainnet, Base, Polygon, common testnets.
- Compliance & Audit:
  - Audit log for every transaction submitted via the platform (who, when, txHash, artifact buildID).
  - Retention defaults: 90 days for logs; enterprise extension possible.
- Reliability:
  - Retry with exponential backoff for transient RPC errors.
  - Worker autoscaling and queue length monitoring.

3. High‑Level Architecture
- Frontend (browser):
  - Dashboard app with Monaco editor, terminal, preview iframe, file explorer.
  - Uses WebChunk runtime in preview iframe.
  - Wallet adapters run client-side: EIP‑1193 injected & WalletConnect v2.
- Backend:
  - API Server (Node.js / TypeScript) — auth (SIWE), project manager, orchestration.
  - Build workers (containerized) running esbuild, produce artifacts, upload to S3.
  - Redis for build/job queue and ephemeral preview state.
  - Postgres for metadata (projects, builds, users, audit logs).
  - S3 compatible object storage for artifacts.
  - KMS for secrets.
- Local/test tooling:
  - Viem for simulateContract / estimation.
  - Optional Anvil mode for deterministic forked simulation.
- Observability:
  - Prometheus/Grafana metrics; ELK or Loki for logs.

Logical component interactions:
- Client → API Server (projects, builds, preview session) → Redis queue → Build Workers → S3 + Postgres → Client preview accesses artifact + WebChunk
- Client Wallet adapters talk to user wallet; TransactionEngine coordinates simulate → ask user to sign → submit via RPC

4. Component & Module Specifications

4.1 Project Studio
- Functions:
  - Create/import projects (GitHub import, ZIP upload).
  - File explorer: scripts (.js/.ts), ABIs (.json), modal templates (.json), config files.
  - Versioning: simple snapshots and build history.
- UI:
  - Resizable panes: Explorer, Editor (Monaco), Preview iframe, Terminal/Build logs.
- Backend APIs:
  - Create/Read/Update/Delete project files.
  - Trigger build and get build logs.

4.2 Script Compiler (server esbuild pipeline)
- Responsibilities:
  - Validate files: syntax, TypeScript if used, ABI shape.
  - Bundle artifacts: produce IIFE and ESM bundles with source maps and integrity hashes.
  - Enforce build policy: no importing secrets, limit network APIs, size limits.
- Implementation:
  - esbuild in build worker containers.
  - Use deterministic build flags (pin dependencies, lockfile, reproducible options).
- Outputs:
  - artifact.zip (or single .js), manifest.json, source maps, sha256 integrity hashes, build logs.

4.3 Wallet Studio (adapters)
- Supported adapters:
  - EIP‑1193 injected
  - WalletConnect v2 (client session only)
- Constraints:
  - Client-side only; no server keys.
  - Provide session management UI via WebChunk.connect/openWallet.
- Features:
  - Wallet selection modal (template).
  - Wallet session interface exposing signTransaction, signTypedData, requestAccounts.

4.4 Transaction Builder
- Responsibilities:
  - Present ABI forms / script-driven UIs for composing parameters.
  - Show calldata preview and gas estimate toggle.
  - Support Multicall3 input packaging.
- Input validation:
  - Validate types with ABI + viem utils.
- UI:
  - Builder should allow view of raw calldata and human-readable parameters.
- Outputs:
  - EncodedTx: { to, data, value?, gasLimit? } passed to TransactionEngine.encode or strategy.encode.

4.5 Modal Designer & Registry
- Templates-only MVP.
- Templates: Connect Wallet, Wallet Selector, Initializing, Transaction Preview, Signature Request, Approval, Processing, Success, Failure.
- Config knobs:
  - Title, body, icons, CTA labels, gas toggle, raw calldata toggle, explorer link config, localization.
- Modal Registry storage:
  - Persisted JSON templates in Postgres / object storage.

4.6 TransactionEngine (canonical)
- Core: stateful engine coordinating transaction lifecycle for registered strategies.
- Plugin model: strategies register with interface below.

TransactionEngine interface (TypeScript-like)
```ts
type ValidationResult = { ok: boolean; errors?: string[] }
type EncodedTx = { to: string; data: string; value?: string; meta?: any }
type SimulationResult = { ok: boolean; gasUsed?: bigint; revertReason?: string; logs?: any; stateDiff?: any }
type GasEstimate = { gasLimit: number; gasPrice?: string; maxFeePerGas?: string; maxPriorityFeePerGas?: string }
type AuthorizationRequest = { type: 'wallet' | 'external', details: any }
type SubmissionResult = { ok: boolean; txHash?: string; error?: string }
type Receipt = { status: number; confirmations: number; blockHash?: string; blockNumber?: number; logs?: any }

interface Strategy {
  validate(params: any): Promise<ValidationResult>
  encode(params: any): Promise<EncodedTx>
  simulate(encoded: EncodedTx, context: SimulationContext): Promise<SimulationResult>
  estimateGas(encoded: EncodedTx, context?: SimulationContext): Promise<GasEstimate>
  authorize(encoded: EncodedTx, context?: AuthorizationContext): Promise<AuthorizationRequest>
  execute(encoded: EncodedTx, auth?: any, context?: ExecuteContext): Promise<SubmissionResult>
  confirm(txHash: string, timeoutMs?: number): Promise<Receipt>
}
```

- Built‑in strategies for MVP:
  - nativeTransfer, erc20Transfer, erc20Approval (allowance), contractWrite (single function), multicall3.

- Engine state machine (canonical):
  IDLE → VALIDATING → SIMULATING → AWAITING_USER_APPROVAL → WALLET_CONFIRMATION → SUBMITTING → PENDING → CONFIRMING → SUCCESS / FAILURE
  - Terminal states: SUCCESS, FAILURE, REJECTION, TIMEOUT, CANCELLED.

- Simulation defaults:
  - Use Viem.simulateContract or callStatic-like method.
  - Optional Anvil fork mode for deterministic runs.

4.7 WebChunk Runtime (preview + exported runtime)
- API surface (v0.x)
```js
WebChunk.init(config: WebChunkConfig): Promise<void>
WebChunk.connect(providerHint?: ProviderHint): Promise<WalletSession>
WebChunk.openWallet(): Promise<void>
WebChunk.simulate(opts: ExecuteOpts): Promise<SimulationResult>
WebChunk.execute(opts: ExecuteOpts): Promise<TransactionSubmissionResult>
WebChunk.signTypedData(typedData: EIP712): Promise<Signature>
WebChunk.disconnect(): Promise<void>
WebChunk.on('stateChange', handler)
WebChunk.on('txEvent', handler)
```
- Error model: WebChunkError with codes:
  - VALIDATION_ERROR, SIMULATION_ERROR, USER_REJECTED, WALLET_ERROR, SUBMIT_ERROR, TIMEOUT, NETWORK_ERROR, PERMISSION_DENIED.

- Runtime requirements:
  - The same runtime code used in preview and in exported artifact.
  - No access to server secrets.
  - Small footprint; bundle re-used across apps.

4.8 Preview Engine (sandbox)
- Implementation:
  - iframe sandbox + postMessage bridge to dashboard.
  - Preview loads built WebChunk runtime and project bundle served from a signed, time-limited URL.
  - Optional Anvil fork mode: a temporary forked RPC (Anvil) for deterministic simulation; credentials only in ephemeral preview runtime (not saved).
- Isolation:
  - iframe sandbox attributes: allow-scripts but disallow top-level navigation; strict CSP.
  - No access to parent cookies/localstorage that contain server secrets.
- Modes:
  - Fast simulated preview (Viem simulate) — lightweight and safe.
  - Deterministic preview (Anvil fork) — optional, heavier.

4.9 Artifact Center & Build Workers
- Build worker process:
  - Pull job from Redis queue.
  - Fetch project files from Postgres or object store.
  - Run validations & esbuild with pinned deps.
  - Produce artifacts (IIFE, ESM, sourcemaps).
  - Compute integrity hashes (sha256).
  - Upload to S3.
  - Generate manifest.json and sign with server private key (KMS/HSM signing) — signing used to verify server build origin.
  - Emit build logs to Postgres and object store.
- Manifest schema (example):
```json
{
  "version": "0.1",
  "projectId": "proj_123",
  "buildId": "build_abc",
  "timestamp": "2026-11-21T00:00:00Z",
  "artifacts": [
    { "path":"bundle.iife.js", "sha256":"..." },
    { "path":"bundle.esm.js", "sha256":"..." }
  ],
  "entry": "bundle.iife.js",
  "webchunkVersion": "0.x",
  "signedBy": "kms-key-id",
  "signature": "base64..."
}
```

4.10 Auth & Orchestration API
- SIWE for wallet sign-in.
- Optional email invites and GitHub onboarding.
- Session management: JWT or session cookies; server stores refresh tokens.
- RBAC for org/team features in enterprise.

5. Data Models & Persistence

5.1 Postgres schemas (core)
- users (id, wallet_address, email, created_at, last_login)
- orgs (id, name, created_at)
- projects (id, org_id, name, description, created_by, created_at)
- project_files (id, project_id, path, content, sha256, updated_by, updated_at)
- builds (id, project_id, build_id, status, build_logs_ref, artifact_location, manifest_sha256, created_at)
- artifacts (id, build_id, path, sha256, size_bytes)
- audit_logs (id, actor_id, action, resource_type, resource_id, details JSONB, timestamp)
- modal_templates (id, org_id, name, json_config, version, updated_at)

5.2 Redis
- build_queue list (job payloads)
- ephemeral preview state (preview_session:{id} -> metadata, signed urls)
- locks (build locks, cancellation tokens)

5.3 S3 artifact layout
- /artifacts/{org_id}/{project_id}/{build_id}/{file}
- Signed manifest: manifest.json + signature
- Signed, time-limited download URLs for frontend preview.

5.4 KMS & Secrets policy
- Store:
  - RPC credentials (encrypted)
  - Build signing key (private key wrapped by KMS)
- Access:
  - Build workers temporarily request decrypted secrets via authenticated channel; secrets exist only in worker memory and are never persisted to disk or included in artifacts.
- Rotation & auditing:
  - KMS key rotation schedule; access logs retained.

6. APIs (server)
Provide REST endpoints (can be GraphQL later). Examples:

Auth
- POST /api/auth/siwe/nonce → { nonce }
- POST /api/auth/siwe/verify { message, signature } → { token }

Projects
- POST /api/projects → { name } → { projectId }
- GET /api/projects/{projectId}
- POST /api/projects/{projectId}/files → upload or save file

Builds
- POST /api/projects/{projectId}/builds → trigger build → { buildId }
- GET /api/builds/{buildId} → { status, logsRef, artifactUrl, manifest }
- GET /api/builds/{buildId}/logs → streaming logs

Preview sessions
- POST /api/preview/sessions → { projectId, mode: 'fast' | 'anvil', chainId } → { sessionId, previewUrl, expiresAt }
- GET /api/preview/sessions/{id}/status

Transaction operations (server-assisted operations only; wallet signing client-side)
- POST /api/tx/validate → { strategy, params } → ValidationResult
- POST /api/tx/simulate → { encodedTx, chainId, simulationMode } → SimulationResult
- POST /api/tx/estimateGas → { encodedTx } → GasEstimate
- POST /api/tx/submit (for relayer-enabled flows) — Relayer-only; requires server-side signing & consent.

Audit
- GET /api/audit?projectId=&actorId=&from=&to=

7. Transaction Flow & State Machine
Canonical state flow (mapped to UI & events):
- IDLE → VALIDATING (strategy.validate) → SIMULATING (strategy.simulate) → AWAITING_USER_APPROVAL (display transaction preview modal) → WALLET_CONFIRMATION (wallet prompts user) → SUBMITTING (send tx) → PENDING (txHash returned) → CONFIRMING (wait for confirmations) → SUCCESS / FAILURE

Events emitted via WebChunk and Desktop UI:
- stateChange { state: string, meta: any }
- txEvent { type: 'txHash'|'receipt'|'confirm'|'error', payload }

Time & Cancellation:
- WALLET_CONFIRMATION / AWAITING_USER_APPROVAL should have configurable timeouts (default 5 min).
- Submission retries: only on network/transient error; do not retry on user rejection.

8. Simulation Modes & Viem / Anvil usage
- Default simulation (fast): use Viem simulateContract / callStatic against public RPC.
  - Pros: fast, lightweight.
  - Cons: non-deterministic in some cases (state drift).
- Deterministic simulation (Anvil fork):
  - Spawn an Anvil instance forked from a target RPC at a block number.
  - Replay transactions deterministically, enabling complex flows and state modifications.
  - Used optionally for security/QA and enterprise mode. Creation of forks is resource-intensive; should be rate-limited.
- Implementation notes:
  - Viem clients per chain configured in backend with pinned provider URLs.
  - For simulateContract, capture revert reasons, gasUsed, traces if possible.
  - Sanitize simulation output before sending to frontend.

9. Error Handling & Retry Strategies
Error model:
- WebChunkError (client runtime) with codes listed earlier.
- API errors: structured response { code, message, details? } with HTTP status mapping.
  - CLIENT_ERROR (4xx), SERVER_ERROR (5xx), RATE_LIMITED (429), NOT_FOUND (404), UNAUTHORIZED (401), FORBIDDEN (403).

Retries:
- For transient RPC errors (5xx, timeouts), apply exponential backoff on submission and simulation retrials:
  - initialDelay = 500ms; factor = 2; maxRetries = 3 (configurable).
- Do not retry on:
  - USER_REJECTED
  - CONTRACT_REVERT (unless strategy triggers alternate approach)
  - GAS_ESTIMATE_FAILED unless user toggles different options.

User feedback:
- Always show clear user-facing error messages for:
  - Validation errors (what field failed)
  - Simulation revert reason
  - Wallet rejection
  - Submission failure (with suggestion for retry/cancel)
- Log all internal errors to centralized logs with correlation IDs.

10. Security & Sandbox Design
- No fake animations or fake success messages: UI must reflect real wallet and submission state.
- Preview sandbox:
  - iframe sandboxed, strict CSP, no access to parent secrets.
  - postMessage bridge limited to required APIs (WebChunk events).
- Secrets:
  - No secrets in artifacts; build workers must not embed RPC credentials in output.
- Signing & verification:
  - Build manifest signed via KMS (HMAC or asymmetric).
  - UI verifies manifest signature before loading artifact in preview.
- Audit & Compliance:
  - Per-transaction audit logs stored immutable (append-only with timestamps).
- Attack surfaces to consider:
  - XSS within project files (scripts). Build pipeline should statically analyze for disallowed APIs. Preview must run untrusted code within isolated iframe.

11. Testing Plan

Unit Tests
- Tools: Vitest.
- Targets:
  - TransactionEngine core logic (state transitions, plugin registration).
  - Strategy implementations (native transfer, ERC‑20, contract write).
  - WebChunk runtime utilities.
  - Compiler/pipeline utilities.

Integration Tests
- Tools: Vitest + Dockerized integration environment (Viem + Anvil).
- Targets:
  - Build worker end‑to‑end: project → build → upload → manifest verification.
  - Preview session lifecycle with Viem simulate.
  - Wallet adapters (WalletConnect v2 flow simulation).

E2E Tests
- Tools: Playwright.
- Scenarios:
  - Compose → simulate → wallet approve (test wallet) → submit → confirm for:
    - native transfer
    - ERC‑20 transfer
    - simple contract write
  - Build → preview → export artifact → import artifact into a clean page, run WebChunk.execute and observe same behavior.
- Test wallets:
  - Use test wallets (injected test extension) and WalletConnect test hub.

Fuzz & Security Tests
- Input fuzzing for ABI parameter marshalling and calldata generation.
- Static analysis for dependency imports; audit bundle for risky packages.
- Penetration tests for preview sandbox and build worker secret leakage.

Test Data & Environments
- Use dedicated testnets and Anvil ephemeral forks.
- Use separate API keys and KMS keys for staging.

Acceptance Tests
- Automated E2E verifying that the canonical flow works for MVP strategies.

12. Observability, Metrics, Logging & Alerts
Metrics (Prometheus)
- Build queue length, build durations, build success/error rate.
- API request latency and error rates.
- TransactionEngine simulations per minute, simulation error rate.
- Preview session counts, anvil fork count.
- Wallet connect sessions active.

Logs
- Centralized logs (ELK/Loki); structured JSON logs with correlation IDs.
- Build logs stored in object storage and referenced in DB.

Alerts
- Build failure rate spikes (>5% in 5m)
- Build queue length > threshold
- Anvil spawn failures
- High rate of API 5xx
- Suspicious audit log activity (many failed sign-ins)

13. CI/CD and Deployment
- Repo: monorepo layout as in onePager.
- CI:
  - Lint, unit tests, type checks.
  - Integration tests for core paths.
  - E2E gating for major merges (Playwright).
- Deployment:
  - Containerized services deployed to cloud (Kubernetes or managed containers).
  - Build workers autoscale via queue depth and CPU.
  - S3/Cloud storage for artifacts and manifests.
- Secrets & keys:
  - All env variables stored in secrets manager; KMS keys managed by cloud provider.
- Release process:
  - Build worker and runtime version pinning. When releasing WebChunk, update dashboard to pin version.

14. Acceptance Criteria & Success Metrics
- E2E flow works for native transfer, ERC‑20 transfer, contract write.
- Server build (small project <50 KB) completes <5s average under normal load.
- Exported artifact runs in a clean browser context and reproduces same runtime behavior as preview.
- Simulation returns revert reasons and gas estimates correctly for >95% of simple cases.
- Audit logs recorded for every submission.
- Basic metrics instrumented and dashboards are visible.

15. Roadmap, Milestones & Rough Estimates (MVP ~3 months)
Sprint 0 (1 week): Repo setup, infra spike (esbuild worker POC), project skeleton.
Sprint 1 (2 weeks): Dashboard shell, Monaco editor, file explorer, project API.
Sprint 2 (2 weeks): Build worker POC, manifest signing, artifact storage.
Sprint 3 (2 weeks): WebChunk runtime skeleton & preview iframe integration.
Sprint 4 (2 weeks): Wallet adapters (EIP‑1193 + WalletConnect), TransactionBuilder UI.
Sprint 5 (2 weeks): TransactionEngine core + strategies (native, ERC‑20, contract write).
Sprint 6 (1 week): E2E tests, QA, fix iteration, release prep.
Contingency: +2 weeks for security review & enterprise features.

16. Developer onboarding & checklist
- Clone monorepo; run bootstrap script.
- Provision local dev env: Postgres, Redis, S3-minio, KMS stub, Viem + Anvil.
- Start API server and local build worker.
- Load sample project (examples/native-transfer).
- Run local build → start preview session → connect test wallet → run E2E smoke.

17. Appendix: Interfaces, Types & Example Payloads

17.1 Example EncodedTx
```json
{
  "to": "0xAbC123...",
  "data": "0x095ea7b3000000000000000000000000...",
  "value": "0x0",
  "meta": {
    "strategy": "erc20Approval",
    "params": {
      "token": "0x...",
      "spender": "0x...",
      "amount": "1000000000000000000"
    }
  }
}
```

17.2 Example TransactionEngine usage (pseudocode)
```ts
const engine = new TransactionEngine({ client: viemClient });

engine.registerStrategy('erc20Approval', Erc20ApprovalStrategy);

async function run(params) {
  const validation = await engine.validate('erc20Approval', params);
  if (!validation.ok) throw validation.errors;

  const encoded = await engine.encode('erc20Approval', params);

  const sim = await engine.simulate(encoded, { chainId: 1 });
  if (!sim.ok) {
    // surface revert reason to user
    return;
  }

  const authReq = await engine.authorize(encoded);
  // WebChunk opens modal and triggers wallet request

  const submission = await engine.execute(encoded, auth);
  // submission.txHash returned
  const receipt = await engine.confirm(submission.txHash);
}
```

17.3 Error codes (API)
- VALIDATION_ERROR (400)
- SIMULATION_ERROR (422)
- USER_REJECTED (403)
- WALLET_ERROR (502)
- SUBMIT_ERROR (500)
- TIMEOUT (504)
- NOT_FOUND (404)
- RATE_LIMITED (429)

17.4 Sample manifest.json (full)
```json
{
  "version": "0.1",
  "projectId": "proj_xxx",
  "buildId": "bld_yyy",
  "timestamp": "2026-11-21T12:00:00Z",
  "artifacts": [
    {
      "path": "bundle.iife.js",
      "sha256": "abc123..."
    },
    {
      "path": "bundle.esm.js",
      "sha256": "def456..."
    }
  ],
  "entry": "bundle.iife.js",
  "webchunkVersion": "0.1.0",
  "signedBy": "kms-key-000",
  "signature": "base64-encoded-signature"
}
```

Closing notes
- This document is intended to be actionable. Next immediate tasks:
  1. Create repository structure (monorepo) per suggested layout.
  2. Implement minimal build worker POC and API endpoint to trigger a build (Sprint 0).
  3. Implement TransactionEngine core skeleton (registration, state machine) and a demo strategy (native transfer).
  4. Implement WebChunk runtime shell and preview iframe integration.

If you want, I can now:
- Produce TASKS.md (sprint backlog and tickets) broken into epics & tasks with story points.
- Produce TRANSACTION_ENGINE.md with concrete TypeScript types, unit tests and example implementations for nativeTransfer & erc20Transfer.
- Produce WebChunk README and example integration snippets.

Which of the three (TASKS.md, TRANSACTION_ENGINE.md, WebChunk README) should I generate next?