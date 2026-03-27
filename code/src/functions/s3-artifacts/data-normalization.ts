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

export function normalizeExecutionSummary(report: ReportJson, pathContext: PathContext): NormalizedItem {
  const sut = report.system_under_test;
  const metrics = report.execution_metrics;
  const summary = report.summary || { total: 0, passed: 0, failed: 0, skipped: 0 };

  const passPercent =
    summary.total > 0 ? ((summary.passed / summary.total) * 100).toFixed(1) : '0.0';

  const executionPercent =
    summary.total > 0
      ? (((summary.total - summary.skipped) / summary.total) * 100).toFixed(1)
      : '0.0';

  const pipelineStatus = summary.failed > 0 ? 'failed' : 'passed';

  return {
    id: compositeExternalId(report, pathContext),
    created_date: metrics?.start || new Date().toISOString(),
    modified_date: metrics?.end || metrics?.start || new Date().toISOString(),
    data: {
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
      start_time: metrics?.start || '',
      end_time: metrics?.end || '',
      duration_seconds: String(metrics?.duration || 0),
      total_cases: String(summary.total),
      passed_cases: String(summary.passed),
      failed_cases: String(summary.failed),
      skipped_cases: String(summary.skipped),
      source_path: sourceKeyFromContext(pathContext),
      pass_percent: passPercent,
      execution_percent: executionPercent,
      pipeline_status: pipelineStatus,
    },
  };
}
