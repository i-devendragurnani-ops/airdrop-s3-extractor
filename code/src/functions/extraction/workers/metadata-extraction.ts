import { ExtractorEventType, processTask } from '@devrev/ts-adaas';

import staticExternalDomainMetadata from '../../s3-artifacts/external_domain_metadata.json';

processTask({
  task: async ({ adapter }) => {
    adapter.initializeRepos([{ itemType: 'external_domain_metadata' }]);

    await adapter.getRepo('external_domain_metadata')?.push([{ ...staticExternalDomainMetadata }]);
    await adapter.emit(ExtractorEventType.MetadataExtractionDone);
  },
  onTimeout: async ({ adapter }) => {
    await adapter.emit(ExtractorEventType.MetadataExtractionError, {
      error: { message: 'Failed to extract metadata. Lambda timeout.' },
    });
  },
});
