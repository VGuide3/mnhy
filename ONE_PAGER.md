# WEB3 FORGE — One‑Pager
Web3 Transaction Engineering & Compilation Studio

---

## Elevator pitch
Give Web3 engineers a single, canonical JavaScript runtime and visual studio to compose, simulate, authorize and submit verified EVM transactions with reproducible compiled artifacts. WEB3 FORGE is a workstation: compiler, unified transaction engine, modal designer, wallet studio, live preview and exportable runtime (WebChunk) — all wired to the same execution contract.

---

## Problem statement (single sentence)
Web3 engineers lack a single, authoritative environment that lets them build, simulate, authorize and submit real EVM transactions (and export reproducible bundles) without switching tools, re‑implementing transaction logic across previews vs. production, or relying on fake preview behavior.

---

## Target audience / personas
- Primary
  - Smart‑contract engineers (build/test contract interactions & flows)
  - Integration / infrastructure engineers (exchanges, infra integrations)
- Secondary
  - QA / security engineers (replay, deterministic testing, failure/safety verification)

Ideal customers: engineering teams at startups / infra providers / exchanges who must reliably construct, test and ship real transaction flows and distribute reproducible Web3 runtime artifacts.

---

## Platforms (MVP)
- Desktop‑first web application (browser).
- Server build API (headless) for authoritative compilation/export.
- Mobile: responsive, read‑only management views only (interactive flows desktop-first).

---

## Core value proposition
- One canonical JS runtime (WebChunk) that powers dashboard preview, compiled bundle, and exported widget.
- One unified TransactionEngine (validate → simulate → authorize → execute → confirm) used everywhere.
- Server‑side builds (esbuild) produce reproducible IIFE + ESM bundles and a signed manifest.
- Safe sandboxed previews (iframe + optional Anvil fork) with no exposure of dashboard secrets.
- Enterprise‑minded constraints: no fake transactions, no embedded private keys, signed artifacts, audit logs.

---

## Key UX / canonical end‑to‑end flow
1. Sign in (SIWE) and org onboarding (email or wallet invite; GitHub optional).
2. Create or import project (GitHub import / ZIP).
3. Edit transaction scripts, ABIs and modal templates (Monaco editor).
4. Compile (server esbuild) — build logs + diagnostics in terminal.
5. Live preview (sandboxed iframe bound to WebChunk runtime).
6. Connect wallet (EIP‑1193 or WalletConnect v2).
7. Compose transaction via Transaction Builder (ABI form or script).
8. TransactionEngine execution state machine: VALIDATING → SIMULATING → AWAITING_USER_APPROVAL → WALLET_CONFIRMATION → SUBMITTING → PENDING → CONFIRMING → SUCCESS / FAILURE (plus REJECTION / TIMEOUT).
9. Receipt verification, audit log entry, export artifact + manifest (IIFE/ESM + integrity hashes).

State machine (canonical)
```
IDLE
  ↓
VALIDATING
  ↓
SIMULATING
  ↓
AWAITING_USER_APPROVAL
  ↓
WALLET_CONFIRMATION
  ↓
SUBMITTING
  ↓
PENDING
  ↓
CONFIRMING
  ↓
SUCCESS
```
(Rejection, timeout and cancellation are separate terminal states.)

---

## Eight core modules (how the workspace is organized)
- Project Studio — create/import/manage projects, file explorer, versions
- Script Compiler — Monaco editor, diagnostics, formatter
- Wallet Studio — injected EIP‑1193 + WalletConnect v2 adapters (client sessions only)
- Transaction Builder — ABI‑driven forms, Multicall3 support, calldata view
- Modal Designer — selectable configurable templates (no custom JS at MVP)
- Transaction Engine — canonical engine: encode, simulate, authorize, execute, verify
- Runtime Manager — WebChunk runtime integration for preview & export
- Artifact Center — export bundles, manifests, versioned artifacts, downloads

These modules are interconnected; the TransactionEngine is canonical and shared across previews, the runtime and the exported bundles.

---

## Modal registry (templates-only for MVP)
Templates:
- Connect Wallet, Wallet Selector, Initializing, Transaction Preview, Signature Request, Approval, Processing, Success, Failure

Configurable knobs:
- Title / subtitle / body / icon
- Primary / secondary CTA labels
- Gas display toggle (show/hide estimates)
- Raw calldata toggle
- Enable speedup / cancel UI
- Explorer link configuration
- Localizable strings

Design rule: changing templates does not change transaction execution logic.

---

## Transaction strategies (MVP → later)
MVP priority (first release):
- Native token transfer
- ERC‑20 transfer
- ERC‑20 approval (allowance flow)
- Contract write (single‑function call)
- Multicall3

Later phases:
- EIP‑2612, Permit2, EIP‑712 typed‑data signing, ERC‑5792 batching, ERC‑7702 account execution, advanced batching strategies

All strategies implement the same engine interface (see below).

---

## TransactionEngine interface (canonical plugin model)
Each strategy implements:
- validate(params) → ValidationResult
- encode(params) → EncodedTx
- simulate(encoded, context) → SimulationResult
- estimateGas(encoded) → GasEstimate
- authorize(encoded) → AuthorizationRequest
- execute(encoded, auth) → SubmissionResult (txHash)
- confirm(txHash) → Receipt

Engine supports registering strategies:
- registerStrategy(name, impl)

Simulation uses Viem (simulateContract) by default; optional Anvil fork mode for deterministic runs.

---

## WebChunk runtime (public v0.x) — minimal API
Example surface for v0.x (beta)
```js
WebChunk.init(config: WebChunkConfig): Promise<void>
WebChunk.connect(providerHint?: ProviderHint): Promise<WalletSession>
WebChunk.openWallet(): Promise<void>
WebChunk.simulate(opts: ExecuteOpts): Promise<SimulationResult>
WebChunk.execute(opts: ExecuteOpts): Promise<TransactionSubmissionResult>
WebChunk.signTypedData(typedData: EIP712): Promise<Signature>
WebChunk.disconnect(): Promise<void>

// Events
WebChunk.on('stateChange', handler)
WebChunk.on('txEvent', handler)
```
Error model: WebChunkError with codes (VALIDATION_ERROR, SIMULATION_ERROR, USER_REJECTED, WALLET_ERROR, SUBMIT_ERROR, TIMEOUT).

Published as beta on npm (v0.x) with docs and examples; the dashboard preview uses the exact same runtime.

---

## Compiler workstation & editor layout
Four resizable panels:
- A: Project explorer (files, ABIs, modals, configs)
- B: Code editor (Monaco; syntax, autocomplete, diagnostics)
- C: Live preview (iframe; modal preview, wallet preview)
- D: Build/terminal (dependency resolution, ABI validation, bundle output, logs)

Build operations:
- Validate → Compile → Bundle → Preview → Test → Export
- Server esbuild produces IIFE + ESM + source maps + integrity hashes

---

## Recommended tech stack (MVP)
- Frontend: HTML5, CSS3, Vanilla JS (dashboard), Monaco Editor
- Icons / fonts: pinned CDN (Lucide), Inter
- Wallet: EIP‑1193 injected + WalletConnect v2 (bundle adapters)
- Blockchain client: Viem (simulateContract & clients)
- Compiler: esbuild (server workers)
- Testing: Vitest + Playwright (E2E)
- Local chain / deterministic: Anvil (optional)
- Backend: Node.js (API & build workers), Redis (build queue), Postgres (metadata), S3 (artifacts), KMS (secrets)
- Live comms: WebSocket for live preview sync

CDN policy: pin versions (no latest); bundle Reown, Viem and adapters into app builds.

---

## Storage, secrets & persistence policy
Persist server-side:
- Project files, build artifacts, manifests, build logs, modal/template registry, ABIs, org/team data, audit logs, usage metrics

Secrets:
- RPC/relayer credentials encrypted in KMS and available only to build workers; never exported into artifacts
- Never store private keys or seed phrases
- Wallet sessions client-side and ephemeral; server stores SIWE sessions/refresh tokens only

Retention: default 90 days for logs; extendable for enterprise.

Artifact export:
- Artifacts stored in object store with signed download links + manifest.json (version, build ID, integrity.sha256).

---

## Security & enterprise constraints (non‑negotiable)
- No fake wallet connections or fake tx success animations presented as real.
- No private keys in dashboard; no RPC credentials in public artifacts.
- No modal bypassing user authorization; every execution requires explicit wallet approval.
- Preview sandboxed (iframe + runtime proxy) with no access to dashboard secrets.
- Signed manifests and audit logs for verification and compliance.

---

## Build & infra architecture (MVP)
- Cloud-managed build service:
  - API server (Node)
  - Build queue (Redis)
  - Containerized build workers (esbuild)
  - Artifact store (S3)
  - Relational DB (Postgres) for metadata
  - Managed KMS for secrets
  - Monitoring & logging (Prometheus/Grafana / ELK or Loki)
- Later: provide Helm chart / self-host option for enterprise.

Build limits & defaults:
- Build timeout: 120s
- Artifact size limit: 50 MB
- Initial chains: Ethereum mainnet (1), Base (8453), Polygon (137), common testnets

---

## Testing & quality assurance
- Unit tests: TransactionEngine, WebChunk, wallet adapters (Vitest)
- Integration: build pipeline + preview + wallet connect (Anvil + Viem)
- E2E: Playwright automations for compile → simulate → sign → submit
- CI gating: unit + integration + critical E2E required before merging major features

---

## Acceptance criteria & success metrics
- E2E flow (compose → simulate → wallet approve → submit → receipt) works for: native transfer, ERC‑20 transfer, and a contract write within the MVP release.
- Server build (small project <50 KB) completes < 5s on average under normal load (target).
- Exported IIFE/ESM artifact runs in browser with the same runtime semantics as dashboard preview.
- Simulation provides revert reasons and gas estimates with high fidelity for >95% simple test cases.
- Basic usage metrics instrumented (builds, RPC calls, artifact downloads); quotas enforced to prevent abuse.

---

## Repo / monorepo recommended layout
web3-forge/
- apps/dashboard/ — frontend shell, panels, editor, preview
- apps/api/ — REST / GraphQL API, auth, build orchestration
- packages/compiler/ — build orchestration & esbuild pipeline
- packages/runtime/ — WebChunk runtime
- packages/transaction-engine/ — core engine & strategies
- packages/wallet-adapters/ — EIP‑1193, WalletConnect
- packages/modal-registry/ — templates, knobs
- packages/action-registry/ — strategies definitions
- packages/preview-engine/ — sandbox harness
- packages/testing/ — fixtures, test helpers
- packages/shared/ — types, schemas
- infra/ — k8s/terraform/helm
- docs/

Deliverables to produce early:
PROJECT.md, ARCHITECTURE.md, ROADMAP.md, TASKS.md, COMPONENT_REGISTRY.md, TRANSACTION_ENGINE.md, RUNTIME_SPEC.md, WebChunk API docs.

---

## Phased roadmap (high level)
Phase 0 — Inspect landing repo & design tokens  
Phase 1 — Dashboard shell (navigation, resizable workspaces, Monaco, terminal)  
Phase 2 — Project + compiler (server esbuild, artifact storage, manifests)  
Phase 3 — Wallet infra & runtime (EIP‑1193 + WalletConnect, WebChunk skeleton, preview sandbox)  
Phase 4 — Transaction Engine (canonical state machine, Viem simulation, default strategies)  
Phase 5 — Modal Designer (templates + knobs), Transaction Builder UX polish  
Phase 6 — Integrations & enterprise (GitHub push, Anvil mode, KMS, org RBAC)  
Phase 7 — Publish WebChunk v0.x, CI/E2E, artifact signing, beta release  
Phase 8 — Self-host & enterprise features (SSO, extended retention, Helm)

MVP priority: deliver a coherent E2E transaction authoring + simulation + wallet approval + submit flow and reproducible build artifacts before UI polish features (visual flow editor, custom JS modals).

---

## Team & timeline recommendation
Target MVP launch: 3 months  
Suggested team (3–4 people):
- Frontend engineer — dashboard, Monaco, preview
- Backend engineer — API, build workers, artifact store
- Infra/DevOps — containerization, queue, S3, KMS
- Part‑time QA / product owner (test plans, acceptance)

If you prefer more features at launch (Anvil, GitHub push), extend to 5–6 engineers and 6 months.

---

## Next steps (for Product & Engineering leadership)
1. Approve this one‑pager and the MVP scope / timeline.
2. Create initial tickets for Phase 1 (dashboard shell), Phase 2 (compiler API & build workers) and Phase 3 (wallet adapters + runtime skeleton).
3. Produce the required docs: ARCHITECTURE.md, TRANSACTION_ENGINE.md, RUNTIME_SPEC.md, and TASKS.md — use the folder structure above.
4. Begin a 2‑week sprint to build the dashboard shell + Monaco + build terminal and a separate spike that proves server esbuild worker + artifact manifest pipeline.
5. Run security review and threat model for sandbox preview and KMS usage before wiring wallet flows to live RPCs.

---

If you want, I can:
- Generate the TASKS.md backlog split into epics & sprint tasks for the 3‑month plan.
- Produce the TRANSACTION_ENGINE.md with detailed interfaces, types and example implementations (native transfer + ERC‑20 + contract write).
- Produce the WebChunk runtime README and example code snippets for SDK consumers.

Would you like me to (a) generate TASKS.md (backlog & sprints), (b) produce TRANSACTION_ENGINE.md, (c) produce WebChunk README, or (d) create all three now?