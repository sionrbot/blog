import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

interface ToolResult {
  diagnostics: { code: string; severity: string; file?: string }[];
  errors: { name: string }[];
  data: { rejected?: unknown[] } | null;
}

// Probe the installed CLI and production config in an isolated, minimal project.
// The real dictionaries and pages are never mutated.
describe('x18n integration probes', () => {
  const root = process.cwd();
  let fixture: string;
  const write = (path: string, value: string) => writeFileSync(join(fixture, path), value);
  const dictionary = (locale: string, values: Record<string, string>) =>
    write(`src/i18n/${locale}.ts`, `export default ${JSON.stringify(values)};`);
  const reset = () => {
    dictionary('en', { hello: 'Hello {name}', home: 'Home' });
    dictionary('zh-Hans', { hello: '你好 {name}', home: '首页' });
    write('src/probe.astro', '---\nconst labels = [t.hello, t.home];\n---\n');
  };
  const run = (...args: string[]) => {
    const processResult = spawnSync(
      process.execPath,
      [join(root, 'node_modules/@x18n/cli/bin.mjs'), ...args, '--root', fixture, '--json'],
      { encoding: 'utf8' },
    );
    expect(processResult.error).toBeUndefined();
    expect(processResult.signal).toBeNull();
    return { exit: processResult.status, result: JSON.parse(processResult.stdout) as ToolResult };
  };
  const check = (code?: string) => {
    const { exit, result } = run('check', '--strict');
    expect(result.errors).toEqual([]);
    expect(exit).toBe(code ? 1 : 0);
    expect(result.diagnostics.map((item) => item.code)).toEqual(code ? [code] : []);
    return result;
  };

  beforeAll(() => {
    fixture = mkdtempSync(join(tmpdir(), 'sionrbot-x18n-'));
    mkdirSync(join(fixture, 'src/i18n'), { recursive: true });
    mkdirSync(join(fixture, 'src/utils'), { recursive: true });
    symlinkSync(join(root, 'node_modules'), join(fixture, 'node_modules'), 'dir');
    copyFileSync(join(root, 'x18n.config.ts'), join(fixture, 'x18n.config.ts'));
    copyFileSync(join(root, 'src/i18n/locales.ts'), join(fixture, 'src/i18n/locales.ts'));
    copyFileSync(join(root, 'src/utils/base-path.ts'), join(fixture, 'src/utils/base-path.ts'));
    write('package.json', '{"type":"module"}');
  });
  afterAll(() => rmSync(fixture, { recursive: true, force: true }));

  it('accepts the valid baseline and finds an unknown Astro property reference', () => {
    reset();
    check();
    write('src/probe.astro', '---\nconst labels = [t.hello, t.home, t.missing];\n---\n');
    const result = check('missing-key');
    expect(JSON.stringify(result.diagnostics)).toContain('src/probe.astro');
    expect(JSON.stringify(result.diagnostics)).toContain('missing');
  });
  it('detects absent and empty Chinese translations', () => {
    reset();
    dictionary('zh-Hans', { home: '首页' });
    check('missing-translation');
    dictionary('zh-Hans', { hello: '', home: '首页' });
    check('empty-translation');
  });
  it('records the scanner whitespace gap covered by dictionary unit tests', () => {
    for (const home of [' ', '\n']) {
      reset();
      dictionary('zh-Hans', { hello: '你好 {name}', home });
      check();
    }
  });
  it('detects placeholder changes but permits repeated placeholders', () => {
    reset();
    dictionary('zh-Hans', { hello: '你好 {wrong}', home: '首页' });
    check('placeholder-mismatch');
    dictionary('zh-Hans', { hello: '你好 {name} {name}', home: '首页' });
    check();
  });
  it('reports unused and target-only keys', () => {
    reset();
    dictionary('zh-Hans', { hello: '你好 {name}', home: '首页', extra: '多余' });
    check('unused-key');
    reset();
    dictionary('en', { hello: 'Hello {name}', home: 'Home', unused: 'Unused' });
    dictionary('zh-Hans', { hello: '你好 {name}', home: '首页', unused: '未使用' });
    check('unused-key');
  });
  it('refuses mismatched writes without mutation and accepts a valid repeated value', () => {
    reset();
    const target = join(fixture, 'src/i18n/zh-Hans.ts');
    const before = readFileSync(target, 'utf8');
    write('apply.json', JSON.stringify({ 'zh-Hans': { hello: '你好 {wrong}' } }));
    const invalid = run('apply', join(fixture, 'apply.json'));
    expect(invalid.exit).toBe(1);
    expect(invalid.result.errors.map((error) => error.name)).toEqual(['X18N4007']);
    expect(invalid.result.data?.rejected).toHaveLength(1);
    expect(readFileSync(target, 'utf8')).toBe(before);
    write('apply.json', JSON.stringify({ 'zh-Hans': { hello: '你好 {name} {name}' } }));
    const valid = run('apply', join(fixture, 'apply.json'));
    expect(valid.exit).toBe(0);
    expect(valid.result.errors).toEqual([]);
    expect(readFileSync(target, 'utf8')).toContain('你好 {name} {name}');
    check();
  });
});
