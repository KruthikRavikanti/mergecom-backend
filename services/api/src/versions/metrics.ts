const metricNames = {
  conflicts: 'mergecom_version_conflicts_total',
  finalizationFailures: 'mergecom_upload_finalization_failures_total',
  finalizedBytes: 'mergecom_upload_finalized_bytes_total',
  objectStoreErrors: 'mergecom_object_store_errors_total',
  uploadDurationCount: 'mergecom_upload_duration_seconds_count',
  uploadDurationSum: 'mergecom_upload_duration_seconds_sum',
} as const;

export class VersionMetrics {
  private conflicts = 0;
  private finalizationFailures = 0;
  private finalizedBytes = 0;
  private objectStoreErrors = 0;
  private uploadDurationCount = 0;
  private uploadDurationSum = 0;

  public recordConflict(): void {
    this.conflicts += 1;
  }

  public recordFinalizationFailure(): void {
    this.finalizationFailures += 1;
  }

  public recordFinalizationSuccess(byteSize: number, durationSeconds: number) {
    this.finalizedBytes += byteSize;
    this.uploadDurationCount += 1;
    this.uploadDurationSum += durationSeconds;
  }

  public recordObjectStoreError(): void {
    this.objectStoreErrors += 1;
  }

  public render(): string {
    return [
      '# TYPE mergecom_upload_finalized_bytes_total counter',
      `${metricNames.finalizedBytes} ${this.finalizedBytes}`,
      '# TYPE mergecom_upload_duration_seconds summary',
      `${metricNames.uploadDurationCount} ${this.uploadDurationCount}`,
      `${metricNames.uploadDurationSum} ${this.uploadDurationSum}`,
      '# TYPE mergecom_upload_finalization_failures_total counter',
      `${metricNames.finalizationFailures} ${this.finalizationFailures}`,
      '# TYPE mergecom_version_conflicts_total counter',
      `${metricNames.conflicts} ${this.conflicts}`,
      '# TYPE mergecom_object_store_errors_total counter',
      `${metricNames.objectStoreErrors} ${this.objectStoreErrors}`,
      '',
    ].join('\n');
  }
}
