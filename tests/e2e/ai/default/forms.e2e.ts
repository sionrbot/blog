import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('a reader can identify why contact submission is unavailable and return to recent writing', async ({
  app,
  agent,
  screen,
  browser,
}) => {
  await app.open('/');
  await agent.act('Open Contact using the main navigation link.');
  await expect(browser).toHaveURL(/\/contact\/?$/);
  await expect(screen.getByRole('heading', 'Contact', { level: 1 })).toBeVisible();
  await expect(screen.getByRole('button', 'Send message')).toBeDisabled();
  await expect(screen.getByText('This form is not connected yet.')).toBeVisible();
  await agent.assert(
    'The contact form explains that it is not connected yet and submission is disabled.',
  );
  await agent.act('Return to the home page using the site name link in the header.');
  await expect(browser).toHaveURL('/');
  await expect(screen.getByRole('heading', 'Recent writing', { level: 1 })).toBeVisible();
  await expect(browser.locator('main form')).toHaveCount(0);
  await expect(screen.getByRole('button', 'Subscribe')).toHaveCount(0);
});
