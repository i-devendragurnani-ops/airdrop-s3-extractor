import {
  EventType,
  ExtractorEventType,
  processTask,
  SyncMode,
} from '@devrev/ts-adaas';

import { S3ArtifactsClient } from '../../s3-artifacts/client';
import { normalizeExecutionSummary } from '../../s3-artifacts/data-normalization';
import { ExtractorState, initialState } from '../index';

const repos = [{ itemType: 'execution_summary' }];

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

processTask<ExtractorState>({
  task: async ({ adapter }) => {
    try {
      adapter.initializeRepos(repos);

      const isNewSync =
        adapter.event.payload.event_type === EventType.StartExtractingData ||
        adapter.event.payload.event_type === EventType.ExtractionDataStart;

      if (isNewSync) {
        adapter.state.completed = initialState.completed;
      }

      if (adapter.state.completed) {
        console.log('[data] Extraction already completed, signaling done.');
        await adapter.emit(ExtractorEventType.DataExtractionDone);
        return;
      }

      const eventContext = (adapter.event.payload.event_context || {}) as Record<string, any>;
      const mode = eventContext.mode as string | undefined;
      const isIncremental = mode === SyncMode.INCREMENTAL;
      const minRunDateFromFolder = isIncremental ? undefined : new Date(Date.now() - THIRTY_DAYS_MS);

      if (minRunDateFromFolder) {
        console.log(
          `[data] Initial sync: only including build runs with folder timestamp >= ${minRunDateFromFolder.toISOString()}`
        );
      } else {
        console.log('[data] Incremental (or unspecified mode): no folder-date cutoff');
      }

      console.log('[data] Creating S3 client...');
      const client = new S3ArtifactsClient(adapter.event);

      console.log('[data] Listing all build runs (env / region / project)...');
      const buildRuns = await client.listAllBuildRuns({ minRunDateFromFolder });
      console.log(`[data] Found ${buildRuns.length} build run(s) after date filter`);

      if (buildRuns.length === 0) {
        console.log('[data] No build runs found. Completing.');
        adapter.state.completed = true;
        await adapter.emit(ExtractorEventType.DataExtractionDone);
        return;
      }

      let summaryCount = 0;

      for (const run of buildRuns) {
        try {
          const report = await client.getReportJson(run.prefix);
          if (!report) {
            console.log(`[data] No report.json in ${run.name}, skipping`);
            continue;
          }

          const pathContext = {
            environment: run.environment,
            region: run.region,
            project: run.project,
            buildRunName: run.name,
          };
          const summaryItem = normalizeExecutionSummary(report, pathContext);
          await adapter.getRepo('execution_summary')?.push([summaryItem]);
          summaryCount++;
        } catch (runError: any) {
          console.error(`[data] Error processing run "${run.name}": ${runError?.message || runError}`);
        }
      }

      console.log(`[data] Done: ${summaryCount} summaries from ${buildRuns.length} runs`);

      adapter.state.completed = true;
      await adapter.emit(ExtractorEventType.DataExtractionDone);
    } catch (error: any) {
      console.error('[data] Fatal error during data extraction:', error?.message || error);
      await adapter.emit(ExtractorEventType.DataExtractionError, {
        error: {
          message: `Data extraction failed: ${error?.message || String(error)}`,
        },
      });
    }
  },
  onTimeout: async ({ adapter }) => {
    await adapter.emit(ExtractorEventType.DataExtractionProgress);
  },
});
