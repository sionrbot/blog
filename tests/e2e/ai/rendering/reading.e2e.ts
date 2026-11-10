import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { positionReadingContent, readingCheckpoints } from '../../../support/e2e-reading.ts';

test('a reader can visually read wide content and use the embedded newsletter', async ({
  app,
  agent,
  browser,
  screen,
}) => {
  await app.open('/articles/e2e-rendering/');
  await expect(screen.getByRole('heading', 'E2E rendering specimen')).toBeVisible();
  for (const checkpoint of readingCheckpoints) {
    await positionReadingContent(browser, checkpoint.selector);
    // Pixels are the evidence: DOM text cannot establish visible contrast or occlusion.
    await agent.assert(checkpoint.assertion, { vision: 'only' });
  }
  await agent.act('Find the Fixture newsletter section');
  await expect(screen.getByRole('heading', 'Fixture newsletter')).toBeVisible();
  await positionReadingContent(browser, '.not-prose.breakout');
  await agent.assert(
    'The Fixture newsletter heading, description, Email address field and Subscribe button are visually readable and laid out without overlapping each other. The button may be muted because subscription is disabled.',
    { vision: 'only' },
  );
  await expect(screen.getByRole('button', 'Subscribe')).toBeDisabled();
  await screen.getByLabel('Email address').fill('reader@example.test');
  await expect(screen.getByLabel('Email address')).toHaveValue('reader@example.test');
});
