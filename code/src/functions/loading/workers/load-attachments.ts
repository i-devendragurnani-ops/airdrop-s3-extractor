import { LoaderEventType, processTask } from '@devrev/ts-adaas';

processTask({
  task: async ({ adapter }) => {
    console.log('[loading] No attachments to load for S3 test artifacts. Completing phase.');
    await adapter.emit(LoaderEventType.AttachmentsLoadingDone, {
      reports: [],
      processed_files: [],
    });
  },
  onTimeout: async ({ adapter }) => {
    await adapter.postState();
    await adapter.emit(LoaderEventType.AttachmentsLoadingProgress, {
      reports: adapter.reports || [],
      processed_files: adapter.processedFiles || [],
    });
  },
});
