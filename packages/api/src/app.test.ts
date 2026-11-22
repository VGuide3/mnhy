import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from './app.js';

const TO = '0x000000000000000000000000000000000000dEaD';
const ONE_ETH = 10n ** 18n;

let app: FastifyInstance;

beforeEach(async () => {
  app = createApp();
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe('API server', () => {
  it('returns health status', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('validates a native transfer', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tx/validate',
      payload: {
        strategy: 'nativeTransfer',
        params: { to: TO, value: ONE_ETH.toString() },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it('returns validation errors for an invalid transfer', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tx/validate',
      payload: {
        strategy: 'nativeTransfer',
        params: { to: '0x123', value: 'not-a-number' },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: false,
      errors: [
        'to must be a 20-byte hex address',
        'value must be a non-negative bigint or numeric string',
      ],
    });
  });

  it('rejects a validate request without a strategy', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tx/validate',
      payload: { params: { to: TO, value: '1' } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR', message: 'strategy is required' },
    });
  });

  it('returns 404 for an unknown strategy', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tx/validate',
      payload: { strategy: 'missingStrategy', params: {} },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'STRATEGY_NOT_FOUND' } });
  });

  it('simulates an encoded transaction', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tx/simulate',
      payload: {
        encodedTx: { to: TO, data: '0x', value: `0x${ONE_ETH.toString(16)}` },
        chainId: 1,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, gasUsed: '21000' });
  });

  it('simulates a direct EncodedTx body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tx/simulate',
      payload: { to: TO, data: '0x', value: '0x0' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, gasUsed: '21000' });
  });

  it('rejects a malformed simulate body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tx/simulate',
      payload: { encodedTx: { to: TO } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('returns simulation reverts as results', async () => {
    const overBalance = `0x${(101n * ONE_ETH).toString(16)}`;
    const response = await app.inject({
      method: 'POST',
      url: '/api/tx/simulate',
      payload: { encodedTx: { to: TO, data: '0x', value: overBalance } },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { ok: boolean; revertReason?: string };
    expect(body.ok).toBe(false);
    expect(body.revertReason).toContain('Insufficient mock balance');
  });

  it('creates a project and queues a build', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'Demo project' },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json() as { projectId: string };
    expect(created.projectId).toMatch(/^proj_/);

    const buildResponse = await app.inject({
      method: 'POST',
      url: `/api/projects/${created.projectId}/builds`,
    });

    expect(buildResponse.statusCode).toBe(202);
    const queued = buildResponse.json() as {
      buildId: string;
      status: string;
      queuePosition: number;
    };
    expect(queued.buildId).toMatch(/^bld_/);
    expect(queued.status).toBe('queued');
    expect(queued.queuePosition).toBe(1);

    const statusResponse = await app.inject({
      method: 'GET',
      url: `/api/builds/${queued.buildId}`,
    });

    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json()).toMatchObject({
      buildId: queued.buildId,
      projectId: created.projectId,
      status: 'queued',
    });
  });

  it('returns 404 when building an unknown project', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/proj_missing/builds',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('returns 404 for unknown routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/unknown' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});
