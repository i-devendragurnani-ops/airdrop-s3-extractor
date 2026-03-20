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

    console.log(`[data] Fetching report.json for sync unit: ${syncUnitId}`);

    const report = await client.getReportJson(syncUnitId);

    if (!report) {
      console.log('[data] No report.json found for this sync unit. Completing.');
      adapter.state.completed = true;
      await adapter.emit(ExtractorEventType.DataExtractionDone);
      return;
    }

    const summaryItem = normalizeExecutionSummary(report);
    await adapter.getRepo('execution_summary')?.push([summaryItem]);
    console.log(`[data] Pushed execution_summary: ${summaryItem.id}`);

    const flatCases = flattenTestCases(report);
    console.log(`[data] Found ${flatCases.length} test cases to normalize`);

    if (flatCases.length > 0) {
      const testCaseItems = flatCases.map(({ testCase, context }) =>
        normalizeTestCase(testCase, context, report)
      );
      await adapter.getRepo('test_case')?.push(testCaseItems);
      console.log(`[data] Pushed ${testCaseItems.length} test_case records`);
    }

    adapter.state.completed = true;
    await adapter.emit(ExtractorEventType.DataExtractionDone);
  },
  onTimeout: async ({ adapter }) => {
    await adapter.emit(ExtractorEventType.DataExtractionProgress);
  },
});
