export interface BlobHead {
  byteSize: number;
  checksum: string | null;
  contentType: string | null;
  lastModified: Date | null;
  storageVersion: string | null;
}

export interface BlobListItem {
  key: string;
  lastModified: Date | null;
}

export interface BlobMultipartUpload {
  initiatedAt: Date | null;
  key: string;
  uploadId: string;
}

export interface SignedBlobGrant {
  expiresAt: Date;
  headers: Record<string, string>;
  method: 'GET' | 'PUT';
  url: string;
}

export interface CompletedMultipartPart {
  etag: string;
  partNumber: number;
}

export interface BlobStore {
  abortMultipartUpload(key: string, multipartUploadId: string): Promise<void>;
  completeMultipartUpload(
    key: string,
    multipartUploadId: string,
    parts: CompletedMultipartPart[],
  ): Promise<BlobHead>;
  copyObject(input: {
    contentType: string;
    destinationKey: string;
    metadata: Record<string, string>;
    sourceKey: string;
  }): Promise<BlobHead>;
  createMultipartUpload(key: string, contentType: string): Promise<string>;
  deleteObject(key: string): Promise<void>;
  getObject(key: string): Promise<AsyncIterable<Uint8Array>>;
  headObject(key: string): Promise<BlobHead | null>;
  listMultipartUploads(prefix: string): Promise<BlobMultipartUpload[]>;
  listObjects(prefix: string): Promise<BlobListItem[]>;
  probe(): Promise<boolean>;
  signDownload(
    key: string,
    downloadFilename: string,
    expiresInSeconds: number,
  ): Promise<SignedBlobGrant>;
  signMultipartPart(
    key: string,
    multipartUploadId: string,
    partNumber: number,
    expiresInSeconds: number,
  ): Promise<SignedBlobGrant>;
  signView(
    key: string,
    contentType: string,
    expiresInSeconds: number,
  ): Promise<SignedBlobGrant>;
  signUpload(
    key: string,
    contentType: string,
    expiresInSeconds: number,
  ): Promise<SignedBlobGrant>;
}
