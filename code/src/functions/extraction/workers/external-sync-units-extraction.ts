import { ExternalSyncUnit, ExtractorEventType, processTask } from '@devrev/ts-adaas';

const ALL_PROJECTS_SYNC_UNIT_ID = 'all';

processTask({
  task: async ({ adapter }) => {
    try {
      console.log('[sync-units] Starting external sync unit extraction');

      const externalSyncUnits: ExternalSyncUnit[] = [
        {
          id: ALL_PROJECTS_SYNC_UNIT_ID,
          name: 'All Projects',
          description:
            'Import test execution reports from every S3 project directory under the configured prefix into one table.',
          item_type: 'execution_summary',
        },
      ];

      console.log(
        `[sync-units] Emitting ${externalSyncUnits.length} sync unit(s): ${JSON.stringify(externalSyncUnits)}`
      );

      await adapter.emit(ExtractorEventType.ExternalSyncUnitExtractionDone, {
        external_sync_units: externalSyncUnits,
      });

      console.log('[sync-units] Successfully emitted external sync units');
    } catch (error: any) {
      console.error('[sync-units] Error during sync unit extraction:', error?.message || error);
      await adapter.emit(ExtractorEventType.ExternalSyncUnitExtractionError, {
        error: {
          message: `Failed to extract external sync units: ${error?.message || String(error)}`,
        },
      });
    }
  },
  onTimeout: async ({ adapter }) => {
    await adapter.emit(ExtractorEventType.ExternalSyncUnitExtractionError, {
      error: { message: 'Failed to extract external sync units. Lambda timeout.' },
    });
  },
});
