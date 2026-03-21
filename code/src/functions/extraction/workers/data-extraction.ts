import {
  EventType,
  ExtractorEventType,
  processTask,
} from '@devrev/ts-adaas';

import { S3ArtifactsClient } from '../../s3-artifacts/client';
import {
  normalizeExecutionSummary,
  normalizeTestCase,
  flattenTestCases,
} from '../../s3-artifacts/data-normalization';
import { ExtractorState, initialState } from '../index';

const repos = [
  { itemType: 'execution_summary' },
  { itemType: 'test_case' },
];

processTask<ExtractorState>({
  task: async ({ adapter }) => {
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

    const client = new S3ArtifactsClient(adapter.event);
    const syncUnitId =
      adapter.event.payload.event_context.external_sync_unit_id ||
      adapter.event.payload.event_context.sync_unit_id ||
      '';

    console.log(`[data] Listing build runs for project: ${syncUnitId}`);
    const buildRuns = await client.listBuildRuns(syncUnitId);
    console.log(`[data] Found ${buildRuns.length} build runs for ${syncUnitId}`);

    if (buildRuns.length === 0) {
      console.log('[data] No build runs found. Completing.');
      adapter.state.completed = true;
      await adapter.emit(ExtractorEventType.DataExtractionDone);
      return;
    }

    let summaryCount = 0;
    let testCaseCount = 0;

    for (const run of buildRuns) {
      const report = await client.getReportJson(run.prefix);
      if (!report) {
        console.log(`[data] No report.json in ${run.name}, skipping`);
        continue;
      }

      const summaryItem = normalizeExecutionSummary(report);
      await adapter.getRepo('execution_summary')?.push([summaryItem]);
      summaryCount++;

      const flatCases = flattenTestCases(report);
      if (flatCases.length > 0) {
        const testCaseItems = flatCases.map(({ testCase, context }) =>
          normalizeTestCase(testCase, context, report)
        );
        await adapter.getRepo('test_case')?.push(testCaseItems);
        testCaseCount += testCaseItems.length;
      }
    }

    console.log(`[data] Done: ${summaryCount} summaries, ${testCaseCount} test cases from ${buildRuns.length} runs`);

    adapter.state.completed = true;
    await adapter.emit(ExtractorEventType.DataExtractionDone);
  },
  onTimeout: async ({ adapter }) => {
    await adapter.emit(ExtractorEventType.DataExtractionProgress);
  },
});
