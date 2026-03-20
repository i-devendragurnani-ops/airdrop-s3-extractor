import { ExternalSyncUnit, ExtractorEventType, processTask } from '@devrev/ts-adaas';

import { S3ArtifactsClient } from '../../s3-artifacts/client';

processTask({
  task: async ({ adapter }) => {
    const client = new S3ArtifactsClient(adapter.event);

    const projects = await client.listProjects();
    if (!projects || projects.length === 0) {
      throw new Error('No project directories found under the configured S3 prefix');
    }

    console.log(`[sync-units] Found ${projects.length} project directories in S3`);

    const externalSyncUnits: ExternalSyncUnit[] = projects.map((project) => ({
      id: project.prefix,
      name: project.name,
      description: `S3 test artifacts project: ${project.name}`,
      item_type: 'Test Reports',
    }));

    await adapter.emit(ExtractorEventType.ExternalSyncUnitExtractionDone, {
      external_sync_units: externalSyncUnits,
    });
  },
  onTimeout: async ({ adapter }) => {
    await adapter.emit(ExtractorEventType.ExternalSyncUnitExtractionError, {
      error: { message: 'Failed to extract external sync units. Lambda timeout.' },
    });
  },
});
