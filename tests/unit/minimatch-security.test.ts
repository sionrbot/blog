import { createRequire } from 'node:module';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { ESLint } from 'eslint';
import { parseForESLint } from '@typescript-eslint/parser';

const rootRequire = createRequire(import.meta.url);
const eslintRequire = createRequire(rootRequire.resolve('eslint'));
const parserRequire = createRequire(rootRequire.resolve('@typescript-eslint/parser'));
const releaseRequire = createRequire(rootRequire.resolve('release-please'));
const consumers = [
  ['eslint', eslintRequire],
  ['@eslint/config-array', createRequire(eslintRequire.resolve('@eslint/config-array'))],
  [
    '@typescript-eslint/typescript-estree',
    createRequire(parserRequire.resolve('@typescript-eslint/typescript-estree')),
  ],
  [
    '@google-automations/git-file-utils',
    createRequire(releaseRequire.resolve('@google-automations/git-file-utils')),
  ],
] as const;

type MatchOptions = {
  optimizationLevel?: number;
  braceExpandMax?: number;
  dot?: boolean;
  flipNegate?: boolean;
};
type Matcher = { match: (path: string, partial?: boolean) => boolean; pattern: string };
type MatcherModule = {
  Minimatch: new (pattern: string, options?: MatchOptions) => Matcher;
  minimatch: (path: string, pattern: string, options?: MatchOptions) => boolean;
};

describe.each(consumers)('minimatch used by %s', (_name, consumerRequire) => {
  const { Minimatch, minimatch } = consumerRequire('minimatch') as MatcherModule;

  it('resolves the security override on this dependency edge', () => {
    expect(consumerRequire('minimatch/package.json').version).toBe('11.0.5');
  });

  it('rejects globstar-parent amplification beyond the configured limit', () => {
    // Small even on the vulnerable version: 32 patterns instead of the allowed 8.
    for (const prefix of ['', 'src/']) {
      const pattern = prefix + Array(5).fill('**/../a/b').join('/');
      expect(() => new Minimatch(pattern, { optimizationLevel: 2, braceExpandMax: 8 })).toThrow(
        RangeError,
      );
    }
  });

  it('preserves legitimate optimized matches below the limit', () => {
    const matcher = new Minimatch('**/../a/b/**/../c/d', {
      optimizationLevel: 2,
      braceExpandMax: 8,
    });
    expect(matcher.match('../a/b/../c/d')).toBe(true);
    expect(matcher.match('x/a/b/y/c/d')).toBe(true);
    expect(matcher.match('x/a/b/y/c/other')).toBe(false);
  });

  it('preserves the options used by linting and release tooling', () => {
    const matcher = new Minimatch('src/**/*.{ts,js}', { dot: true });
    expect(matcher.pattern).toBe('src/**/*.{ts,js}');
    expect(matcher.match('src/nested', true)).toBe(true);
    expect(matcher.match('other/nested', true)).toBe(false);
    expect(matcher.match('src/.config.ts')).toBe(true);
    expect(matcher.match('src/nested/file.css')).toBe(false);
    expect(minimatch('.config.ts', '*.ts', { dot: true })).toBe(true);
    expect(minimatch('src/file.ts', 'src/@(file|other).ts')).toBe(true);
    const negated = new Minimatch('!src/keep.ts', { dot: true, flipNegate: true });
    expect(negated.match('src/keep.ts')).toBe(true);
    expect(negated.match('src/other.ts')).toBe(false);
  });
});

it('keeps ESLint glob traversal, dotfiles and negated ignores working', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'minimatch-eslint-'));
  try {
    const selected = ['src/nested/file.js', 'src/.config.js', 'src/generated/keep.js'];
    for (const file of [...selected, 'src/generated/skip.js']) {
      await mkdir(join(cwd, file, '..'), { recursive: true });
      await writeFile(join(cwd, file), 'debugger;\n');
    }
    const eslint = new ESLint({
      cwd,
      overrideConfigFile: true,
      overrideConfig: [
        { ignores: ['src/generated/*', '!src/generated/keep.js'] },
        { files: ['**/*.js'], rules: { 'no-debugger': 'error' } },
      ],
    });
    const results = await eslint.lintFiles(['src/**/*.js']);
    expect(results.map((result) => result.filePath).sort()).toEqual(
      selected.map((file) => join(cwd, file)).sort(),
    );
    expect(results.every((result) => result.messages[0]?.ruleId === 'no-debugger')).toBe(true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

it('keeps TypeScript ESLint default-project glob matching working', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'minimatch-parser-'));
  try {
    await writeFile(join(cwd, 'tsconfig.json'), '{"compilerOptions":{"strict":true}}');
    const result = parseForESLint('const value: number = 1;', {
      filePath: join(cwd, '.config.ts'),
      tsconfigRootDir: cwd,
      projectService: { allowDefaultProject: ['*.ts'] },
    });
    expect(result.services.program).toBeDefined();
    expect(result.ast.body[0].type).toBe('VariableDeclaration');
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

it('keeps release-please glob lookup and path-prefix stripping working without network access', async () => {
  const { BranchFileCache } = releaseRequire('@google-automations/git-file-utils') as {
    BranchFileCache: {
      prototype: {
        findFilesByGlob: (this: unknown, glob: string, prefix?: string) => Promise<string[]>;
      };
    };
  };
  const cache = {
    branch: 'main',
    async *treeEntryIterator(_branch: string, prefix = '') {
      for (const path of [
        'packages/one/package.json',
        'packages/two/package.json',
        'packages/one/README.md',
        'package.json',
      ]) {
        if (path.startsWith(prefix)) yield { path };
      }
    },
  };
  await expect(
    BranchFileCache.prototype.findFilesByGlob.call(cache, 'packages/*/package.json'),
  ).resolves.toEqual(['packages/one/package.json', 'packages/two/package.json']);
  await expect(
    BranchFileCache.prototype.findFilesByGlob.call(
      cache,
      'packages/one/*.{json,md}',
      'packages/one',
    ),
  ).resolves.toEqual(['package.json', 'README.md']);
});
