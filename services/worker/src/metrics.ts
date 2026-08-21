export class WorkerMetrics {
  private mappingMapped = 0;
  private mappingTotal = 0;
  private renditionDurationCount = 0;
  private renditionDurationSum = 0;
  private renditionFailures = 0;
  private renditionOutputBytes = 0;
  private renditionQueueAgeCount = 0;
  private renditionQueueAgeSum = 0;

  public recordMapping(total: number, mapped: number): void {
    this.mappingTotal += total;
    this.mappingMapped += mapped;
  }

  public recordRenditionFailure(): void {
    this.renditionFailures += 1;
  }

  public recordRenditionSuccess(durationSeconds: number, outputBytes: number) {
    this.renditionDurationCount += 1;
    this.renditionDurationSum += durationSeconds;
    this.renditionOutputBytes += outputBytes;
  }

  public recordRenditionQueueAge(queueAgeSeconds: number): void {
    this.renditionQueueAgeCount += 1;
    this.renditionQueueAgeSum += queueAgeSeconds;
  }

  public render(): string {
    return [
      '# TYPE mergecom_worker_rendition_duration_seconds summary',
      `mergecom_worker_rendition_duration_seconds_count ${this.renditionDurationCount}`,
      `mergecom_worker_rendition_duration_seconds_sum ${this.renditionDurationSum}`,
      '# TYPE mergecom_worker_rendition_failures_total counter',
      `mergecom_worker_rendition_failures_total ${this.renditionFailures}`,
      '# TYPE mergecom_worker_rendition_output_bytes_total counter',
      `mergecom_worker_rendition_output_bytes_total ${this.renditionOutputBytes}`,
      '# TYPE mergecom_worker_rendition_queue_age_seconds summary',
      `mergecom_worker_rendition_queue_age_seconds_count ${this.renditionQueueAgeCount}`,
      `mergecom_worker_rendition_queue_age_seconds_sum ${this.renditionQueueAgeSum}`,
      '# TYPE mergecom_visual_mapping_changes_total counter',
      `mergecom_visual_mapping_changes_total{result="mapped"} ${this.mappingMapped}`,
      `mergecom_visual_mapping_changes_total{result="total"} ${this.mappingTotal}`,
      '',
    ].join('\n');
  }
}
