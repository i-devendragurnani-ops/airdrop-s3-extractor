import { AirdropEvent } from '@devrev/ts-adaas';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';

const S3_REGION = 'us-east-1';
const S3_BUCKET = 'devrev-test-execution-artifacts';
const S3_PREFIX = 'dev/us-east-1/';

export interface ProjectInfo {
  prefix: string;
  name: string;
}

export class S3ArtifactsClient {
  private s3: S3Client;
  private bucketName = S3_BUCKET;
  private prefix = S3_PREFIX;

  constructor(event: AirdropEvent) {
    const connData = event.payload.connection_data as Record<string, any>;
    const key = connData.key || '';

    let fields: Record<string, string> = {};
    try {
      const parsed = JSON.parse(key);
      if (typeof parsed === 'object' && parsed !== null) {
        fields = parsed;
      }
    } catch {
      // key is not JSON — treat as raw access_key_id
    }

    const accessKeyId = fields.access_key_id || connData.access_key_id || key;
    const secretAccessKey = fields.secret_access_key || connData.secret_access_key || '';
    const sessionToken = fields.session_token || connData.session_token || '';

    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        `AWS credentials missing. connection_data keys: [${Object.keys(connData).join(', ')}], ` +
        `parsed fields: [${Object.keys(fields).join(', ')}]`
      );
    }

    console.log('[s3-client] credentials OK, bucket:', this.bucketName, 'prefix:', this.prefix);

    this.s3 = new S3Client({
      region: S3_REGION,
      credentials: {
        accessKeyId,
        secretAccessKey,
        ...(sessionToken ? { sessionToken } : {}),
      },
    });
  }

  async listProjects(): Promise<ProjectInfo[]> {
    const projects: ProjectInfo[] = [];
    let continuationToken: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: this.prefix,
        Delimiter: '/',
        ContinuationToken: continuationToken,
      });

      const response = await this.s3.send(command);
      const prefixes = response.CommonPrefixes || [];

      for (const p of prefixes) {
        if (p.Prefix) {
          const name = p.Prefix.replace(this.prefix, '').replace(/\/$/, '');
          if (name) {
            projects.push({ prefix: p.Prefix, name });
          }
        }
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    return projects;
  }

  projectPrefix(projectName: string): string {
    return `${this.prefix}${projectName}/`;
  }

  async listBuildRuns(projectName: string): Promise<{ prefix: string; name: string }[]> {
    const projectPfx = this.projectPrefix(projectName);
    const runs: { prefix: string; name: string }[] = [];
    let continuationToken: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: projectPfx,
        Delimiter: '/',
        ContinuationToken: continuationToken,
      });

      const response = await this.s3.send(command);
      for (const p of response.CommonPrefixes || []) {
        if (p.Prefix) {
          const name = p.Prefix.replace(projectPfx, '').replace(/\/$/, '');
          if (name) {
            runs.push({ prefix: p.Prefix, name });
          }
        }
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    return runs;
  }

  async getReportJson(projectPrefix: string): Promise<any | null> {
    const key = projectPrefix.endsWith('/')
      ? `${projectPrefix}report.json`
      : `${projectPrefix}/report.json`;

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3.send(command);
      const body = await response.Body?.transformToString('utf-8');

      if (!body) {
        console.log(`[s3] Empty body for ${key}`);
        return null;
      }

      return JSON.parse(body);
    } catch (error: any) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        console.log(`[s3] No report.json found at ${key}`);
        return null;
      }
      throw error;
    }
  }
}
