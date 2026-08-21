export const SAMPLE_NAME_PREFIX = '[SAMPLE] ';

export function isSyntheticSampleName(name: string): boolean {
  return (
    name.startsWith(SAMPLE_NAME_PREFIX) &&
    name.length > SAMPLE_NAME_PREFIX.length
  );
}
