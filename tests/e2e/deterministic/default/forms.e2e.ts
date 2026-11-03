import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('unconfigured contact and newsletter forms explain their disabled submission', async ({
  app,
  browser,
  screen,
}) => {
  await app.open('/contact/');
  await expect(screen.getByRole('heading', 'Contact', { level: 1 })).toBeVisible();
  await expect(screen.getByRole('button', 'Send message')).toBeDisabled();
  await expect(screen.getByText('This form is not connected yet.')).toBeVisible();
  await screen.getByLabel('Name').fill('E2E Reader');
  await screen.getByLabel('Email address').fill('reader@example.test');
  await screen.getByLabel('Message').fill('A local test message.');
  await expect(screen.getByRole('button', 'Send message')).toBeDisabled();
  await expect(browser.locator('input[name="access_key"]')).toHaveValue('');
  await app.open('/');
  await expect(screen.getByRole('heading', 'The Sunday letter')).toBeVisible();
  await expect(screen.getByRole('button', 'Subscribe')).toBeDisabled();
  await expect(screen.getByText('This form is not connected yet.')).toBeVisible();
  await screen.getByLabel('Email address').fill('reader@example.test');
  await expect(screen.getByRole('button', 'Subscribe')).toBeDisabled();
  await expect(browser.locator('form')).not.toHaveAttribute('action');
});
