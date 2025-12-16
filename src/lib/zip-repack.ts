import { unzipSync, zipSync } from "fflate";

type ZipLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export function repackZipBytes(input: Uint8Array, level: number): Uint8Array {
  const safeLevel = Math.max(0, Math.min(9, Math.round(level))) as ZipLevel;
  const files = unzipSync(input);
  return zipSync(files, { level: safeLevel });
}
