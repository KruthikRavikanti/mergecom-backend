const metricNames = {
  conflicts: 'mergecom_version_conflicts_total',
  finalizationFailures: 'mergecom_upload_finalization_failures_total',
  finalizedBytes: 'mergecom_upload_finalized_bytes_total',
  objectStoreErrors: 'mergecom_object_store_errors_total',
  renditionCacheHits: 'mergecom_rendition_cache_hits_total',
  renditionRequests: 'mergecom_rendition_requests_total',
  renditionViewGrants: 'mergecom_rendition_view_grants_total',
  visualArtifactReads: 'mergecom_visual_artifact_reads_total',
  viewerFailures: 'mergecom_visual_viewer_failures_total',
  viewerLoadCount: 'mergecom_visual_viewer_load_seconds_count',
  viewerLoadSum: 'mergecom_visual_viewer_load_seconds_sum',
  uploadDurationCount: 'mergecom_upload_duration_seconds_count',
  uploadDurationSum: 'mergecom_upload_duration_seconds_sum',
} as const;

export class VersionMetrics {
  private conflicts = 0;
  private finalizationFailures = 0;
  private finalizedBytes = 0;
  private objectStoreErrors = 0;
  private renditionCacheHits = 0;
  private renditionRequests = 0;
  private renditionViewGrants = 0;
  private visualArtifactReads = 0;
  private viewerFailures = 0;
  private viewerLoadCount = 0;
  private viewerLoadSum = 0;
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

  public recordRenditionRequest(cacheHit: boolean): void {
    this.renditionRequests += 1;
    if (cacheHit) this.renditionCacheHits += 1;
  }

  public recordRenditionViewGrant(): void {
    this.renditionViewGrants += 1;
  }

  public recordVisualArtifactRead(): void {
    this.visualArtifactReads += 1;
  }

  public recordViewerLoad(durationSeconds: number, failed: boolean): void {
    this.viewerLoadCount += 1;
    this.viewerLoadSum += durationSeconds;
    if (failed) this.viewerFailures += 1;
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
      '# TYPE mergecom_rendition_requests_total counter',
      `${metricNames.renditionRequests} ${this.renditionRequests}`,
      '# TYPE mergecom_rendition_cache_hits_total counter',
      `${metricNames.renditionCacheHits} ${this.renditionCacheHits}`,
      '# TYPE mergecom_rendition_view_grants_total counter',
      `${metricNames.renditionViewGrants} ${this.renditionViewGrants}`,
      '# TYPE mergecom_visual_artifact_reads_total counter',
      `${metricNames.visualArtifactReads} ${this.visualArtifactReads}`,
      '# TYPE mergecom_visual_viewer_load_seconds summary',
      `${metricNames.viewerLoadCount} ${this.viewerLoadCount}`,
      `${metricNames.viewerLoadSum} ${this.viewerLoadSum}`,
      '# TYPE mergecom_visual_viewer_failures_total counter',
      `${metricNames.viewerFailures} ${this.viewerFailures}`,
      '',
    ].join('\n');
  }
}
