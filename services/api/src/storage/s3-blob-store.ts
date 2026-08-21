import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { BlobStorageConfig } from '../config';
import type {
  BlobHead,
  BlobListItem,
  BlobMultipartUpload,
  BlobStore,
  CompletedMultipartPart,
  SignedBlobGrant,
} from './blob-store';

function normalizeEtag(etag: string | undefined): string | null {
  return etag?.replace(/^"|"$/gu, '') ?? null;
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const status = (error as { $metadata?: { httpStatusCode?: number } })
    .$metadata?.httpStatusCode;
  return status === 404;
}

export class S3BlobStore implements BlobStore {
  private readonly bucket: string;
  private readonly client: S3Client;

  public constructor(config: BlobStorageConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      region: config.region,
    });
  }

  public async abortMultipartUpload(
    key: string,
    multipartUploadId: string,
  ): Promise<void> {
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: multipartUploadId,
      }),
    );
  }

  public async completeMultipartUpload(
    key: string,
    multipartUploadId: string,
    parts: CompletedMultipartPart[],
  ): Promise<BlobHead> {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        MultipartUpload: {
          Parts: parts.map((part) => ({
            ETag: part.etag,
            PartNumber: part.partNumber,
          })),
        },
        UploadId: multipartUploadId,
      }),
    );
    const head = await this.headObject(key);
    if (!head) throw new Error('Completed multipart object was not found.');
    return head;
  }

  public async copyObject(input: {
    contentType: string;
    destinationKey: string;
    metadata: Record<string, string>;
    sourceKey: string;
  }): Promise<BlobHead> {
    const source = `${this.bucket}/${input.sourceKey}`
      .split('/')
      .map(encodeURIComponent)
      .join('/');
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        ContentType: input.contentType,
        CopySource: source,
        Key: input.destinationKey,
        Metadata: input.metadata,
        MetadataDirective: 'REPLACE',
      }),
    );
    const head = await this.headObject(input.destinationKey);
    if (!head) throw new Error('Copied object was not found.');
    return head;
  }

  public async createMultipartUpload(
    key: string,
    contentType: string,
  ): Promise<string> {
    const response = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        ContentType: contentType,
        Key: key,
      }),
    );
    if (!response.UploadId) {
      throw new Error('Object storage did not return a multipart upload id.');
    }
    return response.UploadId;
  }

  public async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  public async getObject(key: string): Promise<AsyncIterable<Uint8Array>> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const body = response.Body;
    if (!body || !(Symbol.asyncIterator in body)) {
      throw new Error('Object storage returned a non-streaming response.');
    }
    return body as AsyncIterable<Uint8Array>;
  }

  public async headObject(key: string): Promise<BlobHead | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (response.ContentLength === undefined) {
        throw new Error('Object storage did not return a content length.');
      }
      return {
        byteSize: response.ContentLength,
        checksum: response.ChecksumSHA256 ?? normalizeEtag(response.ETag),
        contentType: response.ContentType ?? null,
        lastModified: response.LastModified ?? null,
        storageVersion: response.VersionId ?? null,
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  public async listObjects(prefix: string): Promise<BlobListItem[]> {
    const items: BlobListItem[] = [];
    let continuationToken: string | undefined;
    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          ContinuationToken: continuationToken,
          Prefix: prefix,
        }),
      );
      for (const item of response.Contents ?? []) {
        if (item.Key) {
          items.push({
            key: item.Key,
            lastModified: item.LastModified ?? null,
          });
        }
      }
      continuationToken = response.IsTruncated
        ? response.NextContinuationToken
        : undefined;
    } while (continuationToken);
    return items;
  }

  public async listMultipartUploads(
    prefix: string,
  ): Promise<BlobMultipartUpload[]> {
    const items: BlobMultipartUpload[] = [];
    let isTruncated = false;
    let keyMarker: string | undefined;
    let uploadIdMarker: string | undefined;
    do {
      const response = await this.client.send(
        new ListMultipartUploadsCommand({
          Bucket: this.bucket,
          KeyMarker: keyMarker,
          UploadIdMarker: uploadIdMarker,
        }),
      );
      for (const upload of response.Uploads ?? []) {
        if (upload.Key?.startsWith(prefix) && upload.UploadId) {
          items.push({
            initiatedAt: upload.Initiated ?? null,
            key: upload.Key,
            uploadId: upload.UploadId,
          });
        }
      }
      keyMarker = response.IsTruncated ? response.NextKeyMarker : undefined;
      uploadIdMarker = response.IsTruncated
        ? response.NextUploadIdMarker
        : undefined;
      isTruncated = response.IsTruncated ?? false;
    } while (isTruncated);
    return items;
  }

  public async probe(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }

  public async signDownload(
    key: string,
    downloadFilename: string,
    expiresInSeconds: number,
  ): Promise<SignedBlobGrant> {
    return {
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      headers: {},
      method: 'GET',
      url: await getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`,
        }),
        { expiresIn: expiresInSeconds },
      ),
    };
  }

  public async signMultipartPart(
    key: string,
    multipartUploadId: string,
    partNumber: number,
    expiresInSeconds: number,
  ): Promise<SignedBlobGrant> {
    return {
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      headers: {},
      method: 'PUT',
      url: await getSignedUrl(
        this.client,
        new UploadPartCommand({
          Bucket: this.bucket,
          Key: key,
          PartNumber: partNumber,
          UploadId: multipartUploadId,
        }),
        { expiresIn: expiresInSeconds },
      ),
    };
  }

  public async signView(
    key: string,
    contentType: string,
    expiresInSeconds: number,
  ): Promise<SignedBlobGrant> {
    return {
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      headers: {},
      method: 'GET',
      url: await getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ResponseContentDisposition: 'inline',
          ResponseContentType: contentType,
        }),
        { expiresIn: expiresInSeconds },
      ),
    };
  }

  public async signUpload(
    key: string,
    contentType: string,
    expiresInSeconds: number,
  ): Promise<SignedBlobGrant> {
    return {
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      headers: { 'content-type': contentType },
      method: 'PUT',
      url: await getSignedUrl(
        this.client,
        new PutObjectCommand({
          Bucket: this.bucket,
          ContentType: contentType,
          Key: key,
        }),
        { expiresIn: expiresInSeconds },
      ),
    };
  }
}
