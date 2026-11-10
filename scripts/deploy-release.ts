import { execFileSync } from 'node:child_process';
import { appendFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { ArtifactClient, downloadRelease } from './release-artifacts.ts';

export function extractReleaseArchive(archive: string, destination: string): void {
  // PR-produced archives are data, never executable installation scripts. Reject links,
  // special files and escaping paths before writing any member into the destination.
  execFileSync(
    'python3',
    [
      '-c',
      `
import pathlib, shutil, sys, tarfile
archive, destination = sys.argv[1:]
root = pathlib.Path(destination).resolve()
with tarfile.open(archive) as source:
    for member in source.getmembers():
        path = pathlib.PurePosixPath(member.name)
        if path.is_absolute() or '..' in path.parts or not (member.isfile() or member.isdir()):
            raise ValueError('Unsafe release archive entry: ' + member.name)
        target = (root / member.name).resolve()
        if not target.is_relative_to(root):
            raise ValueError('Release archive escapes destination')
    for member in source.getmembers():
        target = root / member.name
        if member.isdir():
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            with source.extractfile(member) as contents, target.open('wb') as output:
                shutil.copyfileobj(contents, output)
`,
      archive,
      destination,
    ],
    { stdio: 'pipe' },
  );
}

export async function prepareDeployment(tag: string, directory: string): Promise<void> {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repository || !token) throw new Error('GITHUB_REPOSITORY and GITHUB_TOKEN are required');
  const client = new ArtifactClient(repository, token);
  const latest = await client.json<{ tag_name: string }>('releases/latest');
  if (latest.tag_name !== tag)
    throw new Error('Only the latest published stable Release may deploy');
  await mkdir(directory, { recursive: true });
  const record = await downloadRelease(repository, token, tag, directory);
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `sha=${record.sha}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, source, destination] = process.argv.slice(2);
  if (!source || !destination) throw new Error('Expected <prepare TAG|extract ARCHIVE> DIRECTORY');
  if (command === 'prepare') await prepareDeployment(source, destination);
  else if (command === 'extract') extractReleaseArchive(source, destination);
  else throw new Error(`Unknown command: ${command}`);
}
