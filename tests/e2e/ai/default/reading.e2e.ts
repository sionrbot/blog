import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('a reader discovers an article and related writing through its tag', async ({
  app,
  agent,
  browser,
  screen,
}) => {
  await app.open('/');
  await agent.act('Open Blog using the main navigation link.');
  await expect(browser).toHaveURL(/\/blog\/?$/);
  await expect(screen.getByRole('heading', 'Blog', { level: 1 })).toBeVisible();
  await agent.act('Open the article {title} using its link in the list.', {
    params: { title: 'A Typography Sampler' },
  });
  await expect(browser).toHaveURL(/\/blog\/typography-sampler\/?$/);
  await expect(screen.getByRole('heading', 'A Typography Sampler', { level: 1 })).toBeVisible();
  await agent.act('Follow the {tag} tag link at the end of this article.', {
    params: { tag: '#typography' },
  });
  await expect(browser).toHaveURL(/\/blog\/tag\/typography\/?$/);
  await expect(screen.getByRole('heading', '#typography', { level: 1 })).toBeVisible();
  await expect(screen.getByRole('link', 'A Typography Sampler')).toBeVisible();
  await agent.act('Return to All posts using the link above the tag heading.');
  await expect(browser).toHaveURL(/\/blog\/?$/);
  await expect(screen.getByRole('heading', 'Blog', { level: 1 })).toBeVisible();
});
