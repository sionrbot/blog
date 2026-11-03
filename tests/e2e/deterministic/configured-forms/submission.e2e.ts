import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import {
  assertContactConstraints,
  assertFormValid,
  assertNewsletterConstraints,
  assertSubmission,
  contactSubmission,
  interceptForm,
  newsletterAction,
  newsletterVariants,
} from '../../../support/e2e-forms.ts';

test('configured contact form validates fields and sends the exact native POST', async ({
  app,
  browser,
  screen,
}) => {
  const requests = await interceptForm(browser, contactSubmission.url);
  await app.open('/contact/');
  await assertContactConstraints(browser, screen, requests);
  await screen.getByRole('button', 'Send message').tap();
  await assertSubmission(requests, contactSubmission);
});

for (const { path, fields } of newsletterVariants) {
  test(`newsletter submits native fields from ${path} in a new tab`, async ({
    app,
    browser,
    screen,
  }) => {
    const requests = await interceptForm(browser, newsletterAction);
    await app.open(path);
    await assertNewsletterConstraints(browser, screen, requests);
    await screen.getByLabel('Email address').fill('ada@example.test');
    await assertFormValid(browser);
    await screen.getByRole('button', 'Subscribe').tap();
    await assertSubmission(requests, { url: newsletterAction, method: 'POST', fields });
    await expect(browser).toHaveURL(path);
  });
}
