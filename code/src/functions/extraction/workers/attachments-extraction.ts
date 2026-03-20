import { ExtractorEventType, processTask } from '@devrev/ts-adaas';

processTask({
  task: async ({ adapter }) => {
    console.log('[attachments] No attachments to extract for S3 test artifacts. Completing phase.');
    await adapter.emit(ExtractorEventType.AttachmentExtractionDone);
  },
  onTimeout: async ({ adapter }) => {
    await adapter.emit(ExtractorEventType.AttachmentExtractionError, {
      error: { message: 'Attachments extraction timed out.' },
    });
  },
});
