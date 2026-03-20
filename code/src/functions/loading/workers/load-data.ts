import { LoaderEventType, processTask } from '@devrev/ts-adaas';

processTask({
  task: async ({ adapter }) => {
    console.log('[loading] Loading data (no-op for S3 test artifacts - extraction only)');
    await adapter.emit(LoaderEventType.DataLoadingDone, {
      reports: [],
      processed_files: [],
    });
  },
  onTimeout: async ({ adapter }) => {
    await adapter.postState();
    await adapter.emit(LoaderEventType.DataLoadingProgress, {
      reports: adapter.reports || [],
      processed_files: adapter.processedFiles || [],
    });
  },
});
