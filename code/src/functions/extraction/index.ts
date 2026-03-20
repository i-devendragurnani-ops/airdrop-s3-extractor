import { AirdropEvent, EventType, spawn } from '@devrev/ts-adaas';

import initialDomainMapping from '../s3-artifacts/initial_domain_mapping.json';

export interface ExtractorState {
  completed: boolean;
}

export const initialState: ExtractorState = {
  completed: false,
};

function getWorkerPerExtractionPhase(event: AirdropEvent) {
  let path;
  switch (event.payload.event_type) {
    case EventType.ExtractionExternalSyncUnitsStart:
    case EventType.StartExtractingExternalSyncUnits:
      path = __dirname + '/workers/external-sync-units-extraction';
      break;
    case EventType.ExtractionMetadataStart:
    case EventType.StartExtractingMetadata:
      path = __dirname + '/workers/metadata-extraction';
      break;
    case EventType.ExtractionDataStart:
    case EventType.StartExtractingData:
    case EventType.ExtractionDataContinue:
    case EventType.ContinueExtractingData:
      path = __dirname + '/workers/data-extraction';
      break;
    case EventType.ExtractionAttachmentsStart:
    case EventType.StartExtractingAttachments:
    case EventType.ExtractionAttachmentsContinue:
    case EventType.ContinueExtractingAttachments:
      path = __dirname + '/workers/attachments-extraction';
      break;
  }
  return path;
}

const run = async (events: AirdropEvent[]) => {
  for (const event of events) {
    const file = getWorkerPerExtractionPhase(event);
    await spawn<ExtractorState>({
      event,
      initialState,
      workerPath: file,
      initialDomainMapping,
    });
  }
};

export default run;
