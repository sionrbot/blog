import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { i18nPosts } from '../fixtures/i18n.ts';
import { createFixture, type BuildFixture } from './build-fixture.ts';

async function replaceOnce(path: string, before: string, after: string) {
  const source = await readFile(path, 'utf8');
  if (source.split(before).length !== 2) throw new Error(`Expected exactly one anchor in ${path}`);
  await writeFile(path, source.replace(before, after));
}

/** Only isolated copies receive fixture content and fake form configuration. */
export async function prepareE2EVariant(
  variant: 'rendering' | 'configured-forms' | 'i18n',
): Promise<BuildFixture> {
  const fixture = await createFixture(
    `e2e-${variant}`,
    variant === 'i18n' ? { posts: i18nPosts } : {},
  );
  try {
    if (variant === 'rendering') {
      const longValue = 'unbroken_content_'.repeat(30);
      await writeFile(
        join(fixture.root, 'src/content/blog/e2e-rendering.mdx'),
        `---
title: E2E rendering specimen
description: Wide content and embedded sections for browser regression tests.
pubDate: 2020-01-01
tags: [E2E]
---

import Newsletter from '../../components/sections/Newsletter.astro';

## Wide table

| Identifier | Value |
| --- | --- |
| Wide row | ${longValue} |

## Long code

\`\`\`text
${longValue}
\`\`\`

## Wide equation

$$
${Array.from({ length: 50 }, (_, index) => `x_{${index}}`).join(' + ')} = 0
$$

## Reading checklist

- [x] Read the article
- [ ] Subscribe later

<div class="not-prose breakout">
  <Newsletter title="Fixture newsletter" body="An embedded section retains its own layout." />
</div>
`,
      );
    } else if (variant === 'configured-forms') {
      const configPath = join(fixture.root, 'src/config.ts');
      await replaceOnce(configPath, "web3formsKey: ''", "web3formsKey: 'e2e-fake-key'");
      await replaceOnce(configPath, "action: ''", "action: 'http://127.0.0.1:54321/newsletter'");
      await writeFile(
        join(fixture.root, 'src/pages/e2e-newsletter-default.astro'),
        `---
import BaseLayout from '../layouts/BaseLayout.astro';
import Newsletter from '../components/sections/Newsletter.astro';
import { forms } from '../config';
---
<BaseLayout title="Default newsletter fixture">
  <h1>Default newsletter fixture</h1>
  <Newsletter
    title="Fixture newsletter"
    body="A subscription with default provider fields."
    action={forms.newsletter.action}
  />
</BaseLayout>
`,
      );
      await writeFile(
        join(fixture.root, 'src/pages/e2e-newsletter.astro'),
        `---
import BaseLayout from '../layouts/BaseLayout.astro';
import Newsletter from '../components/sections/Newsletter.astro';
import { forms } from '../config';
---
<BaseLayout title="Newsletter fixture">
  <h1>Newsletter fixture</h1>
  <Newsletter
    title="Fixture newsletter"
    body="A subscription with custom provider fields."
    action={forms.newsletter.action}
    field="subscriber_email"
    hidden={{ list: 'e2e-readers', source: 'fixture' }}
  />
</BaseLayout>
`,
      );
    }
    const result = await fixture.build();
    if (result.code !== 0) throw new Error(`E2E ${variant} build failed; see ${fixture.reportDir}`);
    return fixture;
  } catch (error) {
    await fixture.dispose();
    throw error;
  }
}
