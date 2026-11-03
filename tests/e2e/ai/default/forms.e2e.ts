import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('a reader can identify why contact and newsletter submission are unavailable', async ({
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
  await expect(screen.getByRole('heading', 'Barely Surviving and Deeply Loving')).toBeVisible();
  await agent.act('Find The Sunday letter newsletter section on this page.');
  await expect(screen.getByRole('heading', 'The Sunday letter')).toBeVisible();
  await expect(screen.getByRole('button', 'Subscribe')).toBeDisabled();
  await expect(screen.getByText('This form is not connected yet.')).toBeVisible();
  await agent.assert(
    'The newsletter form explains that it is not connected yet and Subscribe is disabled.',
  );
});
