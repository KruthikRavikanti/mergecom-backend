export type OfficeHost = 'excel' | 'powerpoint' | 'word';

export interface OfficeArtifactDescriptor {
  contentLength: number;
  mediaType: string;
  sha256: string;
  sourceHost: OfficeHost;
}

export function assertOfficeArtifact(
  descriptor: OfficeArtifactDescriptor,
): void {
  if (descriptor.contentLength <= 0)
    throw new Error('Office artifacts cannot be empty.');
  if (!/^[a-f0-9]{64}$/u.test(descriptor.sha256))
    throw new Error('Artifact SHA-256 must be lowercase hex.');
  if (!descriptor.mediaType.startsWith('application/'))
    throw new Error('Artifact media type must be an application type.');
}
