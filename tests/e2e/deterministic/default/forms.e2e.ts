import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('unconfigured contact explains disabled submission and home has no newsletter', async ({
  app,
  browser,
  screen,
}) => {
  await app.open('/');
  await screen.getByRole('navigation', 'Main').getByRole('link', 'Contact').tap();
  await expect(browser).toHaveURL(/\/contact\/?$/);
  await expect(screen.getByRole('heading', 'Contact', { level: 1 })).toBeVisible();
  await expect(screen.getByRole('button', 'Send message')).toBeDisabled();
  await expect(screen.getByText('This form is not connected yet.')).toBeVisible();
  await screen.getByLabel('Name').fill('E2E Reader');
  await screen.getByLabel('Email address').fill('reader@example.test');
  await screen.getByLabel('Message').fill('A local test message.');
  await expect(screen.getByRole('button', 'Send message')).toBeDisabled();
  await expect(browser.locator('input[name="access_key"]')).toHaveValue('');
  await screen.getByRole('banner').getByRole('link', 'Sionrbot personal blog').tap();
  await expect(browser).toHaveURL('/');
  await expect(screen.getByRole('heading', 'Recent writing', { level: 1 })).toBeVisible();
  await expect(browser.locator('main form')).toHaveCount(0);
  await expect(screen.getByRole('button', 'Subscribe')).toHaveCount(0);
});
