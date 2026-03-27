import { NormalizedItem } from '@devrev/ts-adaas';

export interface ReportJson {
  execution_id: string;
  execution_name: string;
  schema_version?: number;
  system_under_test?: {
    name: string;
    version: string;
    environment: string;
    tags?: string[];
  };
  execution_metrics?: {
    type: string;
    framework?: {
      name: string;
      version: string;
    };
    start: string;
    end: string;
    duration: number;
    custom_execution_metrics?: Record<string, any>;
  };
  summary?: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  custom_metadata?: Record<string, any>;
}

/** Parsed from S3 key layout: `{environment}/{region}/{project}/{buildRun}/report.json`. */
export interface PathContext {
  environment: string;
  region: string;
  project: string;
  buildRunName: string;
}

function compositeExternalId(report: ReportJson, path: PathContext): string {
  return `${path.environment}|${path.region}|${path.project}|${report.execution_id}`;
}

function sourceKeyFromContext(path: PathContext): string {
  return `${path.environment}/${path.region}/${path.project}/${path.buildRunName}/report.json`;
}

/** Valid RFC3339 timestamp for AirSync, or omit field when missing/invalid. */
function toRfc3339OrUndefined(iso: string | undefined): string | undefined {
  if (iso == null || typeof iso !== 'string') return undefined;
  const t = Date.parse(iso.trim());
  if (Number.isNaN(t)) return undefined;
  return new Date(t).toISOString();
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function normalizeExecutionSummary(report: ReportJson, pathContext: PathContext): NormalizedItem {
  const sut = report.system_under_test;
  const metrics = report.execution_metrics;
  const summary = report.summary || { total: 0, passed: 0, failed: 0, skipped: 0 };

  const passPercent =
    summary.total > 0 ? round1((summary.passed / summary.total) * 100) : 0;

  const executionPercent =
    summary.total > 0
      ? round1(((summary.total - summary.skipped) / summary.total) * 100)
      : 0;

  const pipelineStatus: 'passed' | 'failed' = summary.failed > 0 ? 'failed' : 'passed';

  const startTime = toRfc3339OrUndefined(metrics?.start);
  const endTime = toRfc3339OrUndefined(metrics?.end);

  const data: Record<string, string | number> = {
    title: `${sut?.name || 'unknown'} / ${report.execution_name} [${pathContext.project}] (${summary.total} cases, ${passPercent}% pass)`,
    execution_id: report.execution_id,
    execution_name: report.execution_name,
    system_name: sut?.name || '',
    system_version: sut?.version || '',
    system_environment: pathContext.environment,
    system_tags: JSON.stringify(sut?.tags || []),
    aws_region: pathContext.region,
    execution_type: metrics?.type || '',
    cases_type: '',
    framework_name: metrics?.framework?.name || '',
    framework_version: metrics?.framework?.version || '',
    duration_seconds: metrics?.duration ?? 0,
    total_cases: Math.trunc(summary.total),
    passed_cases: Math.trunc(summary.passed),
    failed_cases: Math.trunc(summary.failed),
    skipped_cases: Math.trunc(summary.skipped),
    source_path: sourceKeyFromContext(pathContext),
    pass_percent: passPercent,
    execution_percent: executionPercent,
    pipeline_status: pipelineStatus,
  };

  if (startTime !== undefined) data.start_time = startTime;
  if (endTime !== undefined) data.end_time = endTime;

  return {
    id: compositeExternalId(report, pathContext),
    created_date: startTime || new Date().toISOString(),
    modified_date: endTime || startTime || new Date().toISOString(),
    data,
  };
}
