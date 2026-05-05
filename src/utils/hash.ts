import { createHash } from 'crypto';

export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function contentHash(content: string): string {
  return sha256(content);
}

export function chunkId(projectName: string, filePath: string, chunkIndex: number): string {
  return sha256(`${projectName}:${filePath}:${chunkIndex}`);
}
