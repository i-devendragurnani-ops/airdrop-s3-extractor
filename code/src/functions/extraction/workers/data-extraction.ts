import {
  EventType,
  ExtractorEventType,
  processTask,
} from '@devrev/ts-adaas';

import { S3ArtifactsClient } from '../../s3-artifacts/client';
import { normalizeExecutionSummary } from '../../s3-artifacts/data-normalization';
import { ExtractorState, initialState } from '../index';

const repos = [{ itemType: 'execution_summary' }];

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

      console.log('[data] Creating S3 client...');
      const client = new S3ArtifactsClient(adapter.event);

      console.log('[data] Listing all S3 projects...');
      const projects = await client.listProjects();
      console.log(`[data] Found ${projects.length} project(s): ${projects.map((p) => p.name).join(', ')}`);

      const buildRuns: { prefix: string; name: string }[] = [];
      for (const project of projects) {
        const runs = await client.listBuildRuns(project.name);
        console.log(`[data] Project "${project.name}": ${runs.length} build run(s)`);
        buildRuns.push(...runs);
      }

      console.log(
        `[data] Total: ${buildRuns.length} build runs across ${projects.length} project(s)`
      );

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

          const summaryItem = normalizeExecutionSummary(report);
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
