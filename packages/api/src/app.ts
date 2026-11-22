import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  NATIVE_TRANSFER_STRATEGY,
  NativeTransferStrategy,
  TransactionEngine,
  TransactionEngineError,
} from '@web3-forge/tx-engine';
import type {
  EncodedTx,
  SimulationContext,
  SimulationResult,
  TransactionEngineErrorCode,
} from '@web3-forge/tx-engine';

export interface ProjectRecord {
  projectId: string;
  name: string;
  createdAt: string;
}

export type BuildStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface BuildRecord {
  buildId: string;
  projectId: string;
  status: BuildStatus;
  createdAt: string;
  logsRef?: string;
  artifactUrl?: string;
}

export interface BuildJob {
  buildId: string;
  projectId: string;
  requestedAt: string;
}

export interface AppOptions {
  logger?: boolean;
}

export class InMemoryBuildQueue {
  private readonly jobs: BuildJob[] = [];

  enqueue(job: BuildJob): void {
    this.jobs.push(job);
  }

  dequeue(): BuildJob | undefined {
    return this.jobs.shift();
  }

  peek(): BuildJob | undefined {
    return this.jobs[0];
  }

  get size(): number {
    return this.jobs.length;
  }
}

type JsonSimulationResult = Omit<SimulationResult, 'gasUsed'> & { gasUsed?: string };

const ENGINE_ERROR_STATUS: Record<TransactionEngineErrorCode, number> = {
  VALIDATION_ERROR: 400,
  SIMULATION_ERROR: 422,
  USER_REJECTED: 403,
  WALLET_ERROR: 502,
  SUBMIT_ERROR: 500,
  TIMEOUT: 504,
  NETWORK_ERROR: 502,
  PERMISSION_DENIED: 403,
  STRATEGY_NOT_FOUND: 404,
  INVALID_STATE: 409,
  ENCODE_ERROR: 400,
  CONFIRM_ERROR: 502,
};

export function createApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });
  const projects = new Map<string, ProjectRecord>();
  const builds = new Map<string, BuildRecord>();
  const queue = new InMemoryBuildQueue();

  app.get('/health', async () => ({ status: 'ok' }));

  app.post('/api/tx/validate', async (request, reply) => {
    const body = asRecord(request.body);
    const strategy = body?.strategy;
    if (typeof strategy !== 'string' || strategy.trim().length === 0) {
      return badRequest(reply, 'strategy is required');
    }

    const engine = createEngine();
    try {
      const result = await engine.validate(strategy, body?.params);
      return reply.code(200).send(result);
    } catch (error) {
      return sendEngineError(reply, error);
    }
  });

  app.post('/api/tx/simulate', async (request, reply) => {
    const body = asRecord(request.body);
    const encodedTx = extractEncodedTx(request.body);
    if (!encodedTx) {
      return badRequest(reply, 'encodedTx must include string to and data fields');
    }

    const strategyName = resolveSimulationStrategy(body, encodedTx);
    const engine = createEngine();
    try {
      const result = await engine.simulate(
        { ...encodedTx, meta: { ...(encodedTx.meta ?? {}), strategy: strategyName } },
        simulationContext(body),
      );
      return reply.code(200).send(toJsonSimulationResult(result));
    } catch (error) {
      return sendEngineError(reply, error);
    }
  });

  app.post('/api/projects', async (request, reply) => {
    const body = asRecord(request.body);
    const name = body?.name;
    if (typeof name !== 'string' || name.trim().length === 0) {
      return badRequest(reply, 'name is required');
    }

    const project: ProjectRecord = {
      projectId: `proj_${randomUUID()}`,
      name: name.trim(),
      createdAt: new Date().toISOString(),
    };
    projects.set(project.projectId, project);
    return reply.code(201).send({ projectId: project.projectId, project });
  });

  app.get('/api/projects/:projectId', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const project = projects.get(projectId);
    if (!project) return notFound(reply, 'project not found');
    return reply.code(200).send(project);
  });

  app.post('/api/projects/:projectId/builds', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!projects.has(projectId)) return notFound(reply, 'project not found');

    const build: BuildRecord = {
      buildId: `bld_${randomUUID()}`,
      projectId,
      status: 'queued',
      createdAt: new Date().toISOString(),
    };
    builds.set(build.buildId, build);
    queue.enqueue({ buildId: build.buildId, projectId, requestedAt: build.createdAt });

    return reply.code(202).send({
      buildId: build.buildId,
      status: build.status,
      queuePosition: queue.size,
    });
  });

  app.get('/api/builds/:buildId', async (request, reply) => {
    const { buildId } = request.params as { buildId: string };
    const build = builds.get(buildId);
    if (!build) return notFound(reply, 'build not found');
    return reply.code(200).send(build);
  });

  app.setNotFoundHandler((_request, reply) => notFound(reply, 'route not found'));

  app.setErrorHandler((error, _request, reply) => {
    const statusCode =
      error.statusCode !== undefined && error.statusCode >= 400 ? error.statusCode : 500;
    const code = statusCode === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR';
    return reply.code(statusCode).send({ error: { code, message: error.message } });
  });

  return app;
}

function createEngine(): TransactionEngine {
  const engine = new TransactionEngine();
  engine.registerStrategy(NATIVE_TRANSFER_STRATEGY, new NativeTransferStrategy());
  return engine;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractEncodedTx(body: unknown): EncodedTx | null {
  const record = asRecord(body);
  if (!record) return null;

  const candidate = 'encodedTx' in record ? asRecord(record.encodedTx) : record;
  if (!candidate) return null;

  const { to, data } = candidate;
  if (typeof to !== 'string' || typeof data !== 'string') return null;

  const encoded: EncodedTx = { to, data };
  if (candidate.value !== undefined) {
    if (typeof candidate.value !== 'string') return null;
    encoded.value = candidate.value;
  }
  if (candidate.gasLimit !== undefined) {
    if (typeof candidate.gasLimit !== 'number') return null;
    encoded.gasLimit = candidate.gasLimit;
  }
  if (candidate.meta !== undefined) {
    const meta = asRecord(candidate.meta);
    if (!meta) return null;
    encoded.meta = meta;
  }
  return encoded;
}

function resolveSimulationStrategy(
  body: Record<string, unknown> | null,
  encodedTx: EncodedTx,
): string {
  const requested = body?.strategy;
  if (typeof requested === 'string' && requested.trim().length > 0) return requested;

  const fromMeta = encodedTx.meta?.strategy;
  if (typeof fromMeta === 'string' && fromMeta.trim().length > 0) return fromMeta;

  return NATIVE_TRANSFER_STRATEGY;
}

function simulationContext(body: Record<string, unknown> | null): SimulationContext {
  const context: SimulationContext = {};
  if (typeof body?.chainId === 'number') context.chainId = body.chainId;
  if (typeof body?.simulationMode === 'string') context.simulationMode = body.simulationMode;
  return context;
}

function toJsonSimulationResult(result: SimulationResult): JsonSimulationResult {
  const { gasUsed, ...rest } = result;
  return gasUsed === undefined ? rest : { ...rest, gasUsed: gasUsed.toString() };
}

function sendEngineError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof TransactionEngineError) {
    return reply.code(ENGINE_ERROR_STATUS[error.code]).send({
      error: { code: error.code, message: error.message },
    });
  }

  const message = error instanceof Error ? error.message : 'Unexpected error';
  return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message } });
}

function badRequest(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message } });
}

function notFound(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(404).send({ error: { code: 'NOT_FOUND', message } });
}
