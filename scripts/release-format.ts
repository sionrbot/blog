import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const projectFormatter = fileURLToPath(
  new URL('bin/vp', import.meta.resolve('vite-plus/package.json')),
);

export function formatReleaseFile(
  path: string,
  content: string,
  formatterScript = projectFormatter,
): string {
  if (!/\.(?:json|md)$/.test(path)) return content;
  const directory = mkdtempSync(join(tmpdir(), 'release-format-'));
  try {
    // A file is the content channel; launcher/formatter stdout is diagnostics.
    // Keep the repository cwd so vp uses this project's formatting configuration.
    const file = join(directory, basename(path));
    writeFileSync(file, content);
    const result = spawnSync(process.execPath, [formatterScript, 'fmt', file], {
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) throw new Error('Formatter failed');
    const formatted = readFileSync(file, 'utf8');
    if (path.endsWith('.json')) JSON.parse(formatted);
    return formatted;
  } catch (cause) {
    throw new Error(`Could not format release update: ${path}`, { cause });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
