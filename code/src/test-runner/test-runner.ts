#!/usr/bin/env tsx

import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { AirdropEvent } from '@devrev/ts-adaas';
import { functionFactory } from '../function-factory';

function getFixturePathArg(): string {
  const args = process.argv.slice(2);
  const eq = args.find((a) => a.startsWith('--fixturePath='));
  if (eq) return eq.replace('--fixturePath=', '').trim() || 'extraction.json';
  const idx = args.indexOf('--fixturePath');
  if (idx !== -1) return args[idx + 1]?.trim() || 'extraction.json';
  return 'extraction.json';
}

async function startLocalCallbackServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    req.on('data', () => {});
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;

  return {
    url: `http://127.0.0.1:${port}/callback`,
    close: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

async function main() {
  console.log('=== S3 Test Artifacts Snap-in Test Runner ===\n');

  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (!fs.existsSync(envPath)) {
    console.error(`ERROR: .env file not found at ${envPath}`);
    process.exit(1);
  }
  const env = dotenv.parse(fs.readFileSync(envPath));

  if (!env.AWS_ACCESS_KEY_ID) {
    console.error('ERROR: AWS_ACCESS_KEY_ID not found in .env');
    process.exit(1);
  }
  if (!env.AWS_SECRET_ACCESS_KEY) {
    console.error('ERROR: AWS_SECRET_ACCESS_KEY not found in .env');
    process.exit(1);
  }

  const fixturePath = getFixturePathArg();
  const candidates = [
    path.resolve(__dirname, '..', 'fixtures', fixturePath),
    path.resolve(__dirname, '..', '..', 'src', 'fixtures', fixturePath),
  ];
  const fixtureFile = candidates.find((p) => fs.existsSync(p)) || candidates[0];
  if (!fs.existsSync(fixtureFile)) {
    console.error(`ERROR: Fixture not found: ${candidates.join(', ')}`);
    process.exit(1);
  }

  const fixtures: AirdropEvent[] = JSON.parse(fs.readFileSync(fixtureFile, 'utf-8'));
  console.log(`Loaded ${fixtures.length} events from ${fixturePath}\n`);

  const callback = await startLocalCallbackServer();
  const localMode = (env.LOCAL_TEST_MODE || 'sync-units-only').toLowerCase();

  const events: AirdropEvent[] = fixtures.map((evt, i) => {
    const payload = (evt.payload || {}) as Record<string, any>;
    const context = (evt.context || {}) as Record<string, any>;
    const eventCtx = (payload.event_context || {}) as Record<string, any>;
    const execMeta = (evt.execution_metadata || {}) as Record<string, any>;
    const requestId = eventCtx.request_id_adaas || `local-request-${i + 1}`;

    return {
      ...evt,
      payload: {
        ...payload,
        event_type: payload.event_type || (execMeta.event_type || '').toUpperCase(),
        connection_data: {
          ...(payload.connection_data || {}),
          key: env.AWS_ACCESS_KEY_ID,
          access_key_id: env.AWS_ACCESS_KEY_ID,
          secret_access_key: env.AWS_SECRET_ACCESS_KEY,
          region: env.AWS_REGION || 'us-east-1',
          bucket_name: env.S3_BUCKET_NAME || 'devrev-test-execution-artifacts',
          prefix: env.S3_PREFIX || 'dev/',
          session_token: env.AWS_SESSION_TOKEN || '',
        },
        event_context: {
          ...eventCtx,
          callback_url: callback.url,
          worker_data_url: eventCtx.worker_data_url || 'https://api.devrev.ai/internal/airdrop.external-worker',
          sync_unit: eventCtx.sync_unit || '',
          sync_unit_id: eventCtx.sync_unit_id || '',
          request_id_adaas: requestId,
          external_sync_unit_name: eventCtx.external_sync_unit_name || '',
        },
      },
      execution_metadata: { ...execMeta, request_id: requestId },
      context: {
        ...context,
        secrets: { ...(context.secrets || {}), service_account_token: env.DEVREV_PAT || 'not-set' },
      },
    } as unknown as AirdropEvent;
  });

  const toRun =
    localMode === 'full'
      ? events
      : events.filter((e) => e.payload.event_type === 'EXTRACTION_EXTERNAL_SYNC_UNITS_START');

  for (let i = 0; i < toRun.length; i++) {
    const event = toRun[i];
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Event ${i + 1}/${toRun.length}: ${event.payload.event_type}`);
    console.log('='.repeat(60));

    try {
      const t0 = Date.now();
      const result = await functionFactory.extraction([event]);
      console.log(`\nDone (${Date.now() - t0}ms)`);
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('\nFailed:', error);
      process.exit(1);
    }
  }

  await callback.close();
  console.log('\nAll events processed.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
