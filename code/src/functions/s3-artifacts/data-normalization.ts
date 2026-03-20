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
  test_suites?: TestSuiteGroup[];
}

export interface TestSuiteGroup {
  name: string;
  file: string;
  description?: string;
  status: string;
  tags?: string[];
  execution_metrics?: SuiteExecutionMetrics;
  custom_metadata?: Record<string, any>;
  suites?: Suite[];
}

export interface Suite {
  name: string;
  file: string;
  description?: string;
  status: string;
  tags?: string[];
  execution_metrics?: SuiteExecutionMetrics;
  custom_metadata?: Record<string, any>;
  test_cases?: TestCase[];
}

export interface SuiteExecutionMetrics {
  start_time: string;
  end_time: string;
  duration: number;
}

export interface TestCase {
  name: string;
  full_name: string;
  description?: string;
  file: string;
  status: string;
  tags?: string[];
  execution_metrics?: {
    start_time: string;
    end_time: string;
    duration: number;
    custom_execution_metrics?: Record<string, any>;
  };
  custom_metadata?: Record<string, any>;
  success?: { message: string };
  failure?: { message: string; stacktrace?: string };
}

export function normalizeExecutionSummary(report: ReportJson): NormalizedItem {
  const sut = report.system_under_test;
  const metrics = report.execution_metrics;
  const summary = report.summary || { total: 0, passed: 0, failed: 0, skipped: 0 };

  const passPercent =
    summary.total > 0 ? ((summary.passed / summary.total) * 100).toFixed(1) : '0.0';

  const pipelineStatus =
    summary.failed > 0 ? 'failed' : 'passed';

  return {
    id: report.execution_id,
    created_date: metrics?.start || new Date().toISOString(),
    modified_date: metrics?.end || metrics?.start || new Date().toISOString(),
    data: {
      title: `${sut?.name || 'unknown'} / ${report.execution_name} (${summary.total} tests, ${passPercent}% pass)`,
      execution_id: report.execution_id,
      execution_name: report.execution_name,
      system_name: sut?.name || '',
      system_version: sut?.version || '',
      system_environment: sut?.environment || '',
      system_tags: JSON.stringify(sut?.tags || []),
      execution_type: metrics?.type || '',
      framework_name: metrics?.framework?.name || '',
      framework_version: metrics?.framework?.version || '',
      start_time: metrics?.start || '',
      end_time: metrics?.end || '',
      duration_seconds: String(metrics?.duration || 0),
      total_tests: String(summary.total),
      passed_tests: String(summary.passed),
      failed_tests: String(summary.failed),
      skipped_tests: String(summary.skipped),
      pass_percent: passPercent,
      pipeline_status: pipelineStatus,
      source_path: report.execution_id,
    },
  };
}

export interface SuiteContext {
  suiteName: string;
  suiteFile: string;
}

export function normalizeTestCase(
  tc: TestCase,
  context: SuiteContext,
  report: ReportJson
): NormalizedItem {
  const metrics = tc.execution_metrics;
  const failureMessage = tc.failure?.message || '';

  return {
    id: `${report.execution_id}::${tc.full_name || tc.name}`,
    created_date: metrics?.start_time || new Date().toISOString(),
    modified_date: metrics?.end_time || metrics?.start_time || new Date().toISOString(),
    data: {
      title: `${tc.full_name || tc.name} [${tc.status}]`,
      test_name: tc.name,
      full_name: tc.full_name || tc.name,
      suite_name: context.suiteName,
      file_path: tc.file || context.suiteFile,
      status: tc.status,
      tags: JSON.stringify(tc.tags || []),
      start_time: metrics?.start_time || '',
      end_time: metrics?.end_time || '',
      duration_seconds: String(metrics?.duration || 0),
      failure_message: failureMessage,
      execution_id: report.execution_id,
    },
  };
}

/**
 * Flattens all test cases from the nested test_suites -> suites -> test_cases hierarchy.
 */
export function flattenTestCases(
  report: ReportJson
): { testCase: TestCase; context: SuiteContext }[] {
  const results: { testCase: TestCase; context: SuiteContext }[] = [];

  for (const suiteGroup of report.test_suites || []) {
    for (const suite of suiteGroup.suites || []) {
      const context: SuiteContext = {
        suiteName: suite.name || suiteGroup.name,
        suiteFile: suite.file || suiteGroup.file,
      };

      for (const tc of suite.test_cases || []) {
        results.push({ testCase: tc, context });
      }
    }
  }

  return results;
}
