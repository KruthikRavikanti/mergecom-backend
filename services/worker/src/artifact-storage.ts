import { createHash } from 'node:crypto';

import {
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import type { WorkerConfig } from './config';
import { PermanentProcessingError } from './types';

export class ArtifactStorage {
  private readonly bucket: string;
  private readonly client: S3Client;
  private readonly maxArtifactBytes: number;

  public constructor(config: WorkerConfig) {
    this.bucket = config.s3.bucket;
    this.maxArtifactBytes = config.maxArtifactBytes;
    this.client = new S3Client({
      credentials: {
        accessKeyId: config.s3.accessKey,
        secretAccessKey: config.s3.secretKey,
      },
      endpoint: config.s3.endpoint,
      forcePathStyle: config.s3.forcePathStyle,
      region: config.s3.region,
    });
  }

  public async probe(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }

  public async readArtifact(input: {
    byteSize: number;
    objectKey: string;
    sha256: string;
  }): Promise<Uint8Array> {
    if (input.byteSize > this.maxArtifactBytes) {
      throw new PermanentProcessingError(
        'artifact_size_limit',
        'The artifact exceeds the worker input limit.',
      );
    }
    const bytes = await this.readObject(input.objectKey, this.maxArtifactBytes);
    if (bytes.byteLength !== input.byteSize) {
      throw new PermanentProcessingError(
        'artifact_size_mismatch',
        'The artifact size does not match its immutable metadata.',
      );
    }
    const actualSha256 = createHash('sha256').update(bytes).digest('hex');
    if (actualSha256 !== input.sha256) {
      throw new PermanentProcessingError(
        'artifact_hash_mismatch',
        'The artifact SHA-256 does not match its immutable metadata.',
      );
    }
    return bytes;
  }

  public async putSnapshot(input: {
    body: Uint8Array;
    key: string;
    snapshotSha256: string;
    stableHash: string;
  }): Promise<void> {
    return this.putImmutableJson({
      body: input.body,
      conflictCode: 'snapshot_object_conflict',
      conflictMessage:
        'The immutable snapshot key already contains different bytes.',
      key: input.key,
      metadata: {
        'schema-kind': 'normalized-ooxml-snapshot',
        'snapshot-sha256': input.snapshotSha256,
        'stable-hash': input.stableHash,
      },
      sha256: input.snapshotSha256,
    });
  }

  public async putComparison(input: {
    body: Uint8Array;
    key: string;
    resultSha256: string;
    stableHash: string;
  }): Promise<void> {
    return this.putImmutableJson({
      body: input.body,
      conflictCode: 'comparison_object_conflict',
      conflictMessage:
        'The immutable comparison key already contains different bytes.',
      key: input.key,
      metadata: {
        'result-sha256': input.resultSha256,
        'schema-kind': 'ooxml-semantic-comparison',
        'stable-hash': input.stableHash,
      },
      sha256: input.resultSha256,
    });
  }

  private async putImmutableJson(input: {
    body: Uint8Array;
    conflictCode: string;
    conflictMessage: string;
    key: string;
    metadata: Record<string, string>;
    sha256: string;
  }): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Body: input.body,
          Bucket: this.bucket,
          ContentType: 'application/json',
          IfNoneMatch: '*',
          Key: input.key,
          Metadata: input.metadata,
        }),
      );
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (status !== 412) throw error;
      const existing = await this.readObject(input.key, 20 * 1024 * 1024);
      const existingHash = createHash('sha256').update(existing).digest('hex');
      if (existingHash !== input.sha256) {
        throw new PermanentProcessingError(
          input.conflictCode,
          input.conflictMessage,
        );
      }
    }
  }

  private async readObject(key: string, limit: number): Promise<Uint8Array> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if ((response.ContentLength ?? 0) > limit) {
      throw new PermanentProcessingError(
        'artifact_size_limit',
        'The object exceeds its bounded read limit.',
      );
    }
    const body = response.Body;
    if (!body || !(Symbol.asyncIterator in body)) {
      throw new Error('Object storage returned a non-streaming body.');
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      total += chunk.byteLength;
      if (total > limit) {
        throw new PermanentProcessingError(
          'artifact_size_limit',
          'The object exceeds its bounded read limit.',
        );
      }
      chunks.push(chunk);
    }
    const output = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return output;
  }
}
