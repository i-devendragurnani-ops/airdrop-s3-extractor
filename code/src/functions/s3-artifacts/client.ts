import { AirdropEvent } from '@devrev/ts-adaas';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';

/** AWS region used for the S3 API client only (not the data-path region). */
const S3_API_REGION = 'us-east-1';
const S3_BUCKET = 'devrev-test-execution-artifacts';

export interface ProjectInfo {
  prefix: string;
  name: string;
}

export interface BuildRunRef {
  prefix: string;
  name: string;
}

export interface BuildRunInfo extends BuildRunRef {
  environment: string;
  region: string;
  project: string;
}

export interface ListAllBuildRunsOptions {
  /** When set, build-run folders whose parsed folder-name date is strictly before this are omitted. Folders with no parseable date are kept. */
  minRunDateFromFolder?: Date;
}

/**
 * Parses trailing `YYYY-MM-DD--HH-mm-ss` from a build-run folder name
 * (e.g. `...-1773057600-2026-03-09--12-00-27`).
 */
export function parseBuildRunFolderDate(folderName: string): Date | null {
  const m = folderName.match(/(\d{4}-\d{2}-\d{2})--(\d{2})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, dayPart, hh, mm, ss] = m;
  const iso = `${dayPart}T${hh}:${mm}:${ss}.000Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export class S3ArtifactsClient {
  private s3: S3Client;
  private bucketName = S3_BUCKET;

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

    console.log('[s3-client] credentials OK, bucket:', this.bucketName, '(enumerate env/region from root)');

    this.s3 = new S3Client({
      region: S3_API_REGION,
      credentials: {
        accessKeyId,
        secretAccessKey,
        ...(sessionToken ? { sessionToken } : {}),
      },
    });
  }

  private async listChildPrefixes(prefix: string): Promise<string[]> {
    const normalized = prefix.endsWith('/') || prefix === '' ? prefix : `${prefix}/`;
    const out: string[] = [];
    let continuationToken: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: normalized,
        Delimiter: '/',
        ContinuationToken: continuationToken,
      });

      const response = await this.s3.send(command);
      for (const p of response.CommonPrefixes || []) {
        if (p.Prefix) out.push(p.Prefix);
      }
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    return out.sort();
  }

  private childSegmentName(parentPrefix: string, childFullPrefix: string): string {
    if (!parentPrefix) {
      return childFullPrefix.replace(/\/$/, '');
    }
    const parent = parentPrefix.endsWith('/') ? parentPrefix : `${parentPrefix}/`;
    return childFullPrefix.replace(parent, '').replace(/\/$/, '');
  }

  /** Top-level env segments: dev, qa, prod, ... */
  async listEnvironments(): Promise<string[]> {
    const prefixes = await this.listChildPrefixes('');
    return prefixes.map((p) => this.childSegmentName('', p)).filter(Boolean);
  }

  /** Region segments under `{environment}/`: us-east-1, ... */
  async listRegions(environment: string): Promise<string[]> {
    const base = `${environment.replace(/\/$/, '')}/`;
    const prefixes = await this.listChildPrefixes(base);
    return prefixes.map((p) => this.childSegmentName(base, p)).filter(Boolean);
  }

  /**
   * Project folders under `{environment}/{region}/`.
   * `envRegionPrefix` must look like `dev/us-east-1/`.
   */
  async listProjects(envRegionPrefix: string): Promise<ProjectInfo[]> {
    const base = envRegionPrefix.endsWith('/') ? envRegionPrefix : `${envRegionPrefix}/`;
    const prefixes = await this.listChildPrefixes(base);
    return prefixes.map((p) => ({
      prefix: p,
      name: this.childSegmentName(base, p),
    }));
  }

  /**
   * Build-run folders directly under a project prefix (e.g. `dev/us-east-1/flow/`).
   */
  async listBuildRuns(projectPrefix: string): Promise<BuildRunRef[]> {
    const base = projectPrefix.endsWith('/') ? projectPrefix : `${projectPrefix}/`;
    const prefixes = await this.listChildPrefixes(base);
    return prefixes.map((p) => ({
      prefix: p,
      name: this.childSegmentName(base, p),
    }));
  }

  /**
   * Walks env -> region -> project -> build-run and returns flattened rows.
   */
  async listAllBuildRuns(options: ListAllBuildRunsOptions = {}): Promise<BuildRunInfo[]> {
    const { minRunDateFromFolder } = options;
    const results: BuildRunInfo[] = [];

    const environments = await this.listEnvironments();
    for (const environment of environments) {
      const regions = await this.listRegions(environment);
      for (const region of regions) {
        const envRegionPrefix = `${environment}/${region}/`;
        const projects = await this.listProjects(envRegionPrefix);
        for (const project of projects) {
          const runs = await this.listBuildRuns(project.prefix);
          for (const run of runs) {
            if (minRunDateFromFolder) {
              const folderDate = parseBuildRunFolderDate(run.name);
              if (folderDate && folderDate < minRunDateFromFolder) {
                continue;
              }
            }
            results.push({
              ...run,
              environment,
              region,
              project: project.name,
            });
          }
        }
      }
    }

    return results;
  }

  async getReportJson(runPrefix: string): Promise<any | null> {
    const key = runPrefix.endsWith('/') ? `${runPrefix}report.json` : `${runPrefix}/report.json`;

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
