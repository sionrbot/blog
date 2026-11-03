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
  agent,
  browser,
  screen,
}) => {
  const requests = await interceptForm(browser, contactSubmission.url);
  await app.open('/contact/');
  await assertContactConstraints(browser, screen, requests);
  await agent.act('Submit the completed contact form using Send message');
  await assertSubmission(requests, contactSubmission);
});

for (const { path, fields } of newsletterVariants) {
  test(`newsletter submits native fields from ${path} in a new tab`, async ({
    app,
    agent,
    browser,
    screen,
  }) => {
    const requests = await interceptForm(browser, newsletterAction);
    await app.open(path);
    await assertNewsletterConstraints(browser, screen, requests);
    await agent.act('Enter {email} in the newsletter Email address field without submitting', {
      params: { email: 'ada@example.test' },
    });
    await expect(screen.getByLabel('Email address')).toHaveValue('ada@example.test');
    await assertFormValid(browser);
    // Popup submission leaves this screen unchanged; use one exact submit action.
    await screen.getByRole('button', 'Subscribe').tap();
    await assertSubmission(requests, { url: newsletterAction, method: 'POST', fields });
    await expect(browser).toHaveURL(path);
  });
}
