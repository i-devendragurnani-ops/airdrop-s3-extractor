import { AirdropEvent } from '@devrev/ts-adaas';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';

export interface S3Config {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucketName: string;
  prefix: string;
}

export interface ProjectInfo {
  prefix: string;
  name: string;
}

export class S3ArtifactsClient {
  private s3: S3Client;
  private bucketName: string;
  private prefix: string;

  constructor(event: AirdropEvent) {
    const connData = event.payload.connection_data as Record<string, any>;
    const orgData = connData.org_data || {};
    const key = connData.key || '';

    const accessKeyId = orgData.access_key_id || connData.access_key_id || key;
    const secretAccessKey = orgData.secret_access_key || connData.secret_access_key || '';
    const region = orgData.region || connData.region || 'us-east-1';
    const sessionToken = orgData.session_token || connData.session_token || '';

    this.bucketName = orgData.bucket_name || connData.bucket_name || 'devrev-test-execution-artifacts';
    this.prefix = orgData.prefix || connData.prefix || 'dev/';

    if (!this.prefix.endsWith('/')) {
      this.prefix += '/';
    }

    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        'AWS credentials are missing. Provide access_key_id and secret_access_key via the connection.'
      );
    }

    this.s3 = new S3Client({
      region,
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
