import type { Browser } from '@e2e-dev/web';
import { expect, type Screen } from 'e2e';

export interface FormRequest {
  url: string;
  method: string;
  fields: Record<string, string>;
}

export const contactFields = [
  { id: 'contact-name', label: 'Name', value: 'Ada Reader' },
  { id: 'contact-email', label: 'Email address', value: 'ada@example.test' },
  { id: 'contact-message', label: 'Message', value: 'A browser test message.' },
] as const;
export type ContactField = (typeof contactFields)[number];

export const contactSubmission = {
  url: 'https://api.web3forms.com/submit',
  method: 'POST',
  fields: {
    access_key: 'e2e-fake-key',
    subject: 'New message from Sionrbot-blog',
    name: 'Ada Reader',
    email: 'ada@example.test',
    message: 'A browser test message.',
  },
};

export const newsletterAction = 'http://127.0.0.1:54321/newsletter';
export const newsletterVariants = [
  { path: '/e2e-newsletter-default/', fields: { email: 'ada@example.test' } },
  {
    path: '/e2e-newsletter/',
    fields: { subscriber_email: 'ada@example.test', list: 'e2e-readers', source: 'fixture' },
  },
] as const;

/** Install before opening the page; context-wide routes also intercept newsletter popups. */
export async function interceptForm(browser: Browser, action: string): Promise<FormRequest[]> {
  const requests: FormRequest[] = [];
  await browser.route(action, async (route) => {
    requests.push({
      url: route.request.url,
      method: route.request.method,
      fields: Object.fromEntries(new URLSearchParams(route.request.postData)),
    });
    await route.fulfill({ contentType: 'text/html', body: '<h1>Intercepted form submission</h1>' });
  });
  return requests;
}

export async function fillValidContact(screen: Screen) {
  for (const field of contactFields) await screen.getByLabel(field.label).fill(field.value);
}

/** Shared contract used by normal tests and browser-only required-attribute mutations. */
export async function assertRequiredContactField(browser: Browser, field: ContactField) {
  const state = await browser.evaluate((id) => {
    const input = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;
    return { valueMissing: input.validity.valueMissing, formValid: input.form!.checkValidity() };
  }, field.id);
  expect(state, `required contact field: ${field.label}`).toEqual({
    valueMissing: true,
    formValid: false,
  });
}

export async function assertContactConstraints(
  browser: Browser,
  screen: Screen,
  requests: FormRequest[],
) {
  const submit = screen.getByRole('button', 'Send message');
  await expect(submit).toBeEnabled();
  await fillValidContact(screen);
  for (const field of contactFields) {
    await screen.getByLabel(field.label).clear();
    await assertRequiredContactField(browser, field);
    await submit.tap();
    expect(requests).toHaveLength(0);
    await screen.getByLabel(field.label).fill(field.value);
  }
  await screen.getByLabel('Email address').fill('invalid-address');
  expect(
    await browser.evaluate(
      () => document.querySelector<HTMLInputElement>('#contact-email')!.validity.typeMismatch,
    ),
  ).toBe(true);
  await submit.tap();
  expect(requests).toHaveLength(0);
  await screen.getByLabel('Email address').fill('ada@example.test');
  await assertFormValid(browser);
}

export async function assertNewsletterConstraints(
  browser: Browser,
  screen: Screen,
  requests: FormRequest[],
) {
  const submit = screen.getByRole('button', 'Subscribe');
  await expect(submit).toBeEnabled();
  await expect(browser.locator('form')).toHaveAttribute('target', '_blank');
  await submit.tap();
  expect(
    await browser.evaluate(
      () => document.querySelector<HTMLInputElement>('#newsletter-email')!.validity.valueMissing,
    ),
  ).toBe(true);
  expect(requests).toHaveLength(0);
  await screen.getByLabel('Email address').fill('invalid-address');
  expect(
    await browser.evaluate(
      () => document.querySelector<HTMLInputElement>('#newsletter-email')!.validity.typeMismatch,
    ),
  ).toBe(true);
  await submit.tap();
  expect(requests).toHaveLength(0);
}

export async function assertFormValid(browser: Browser) {
  expect(
    await browser.evaluate(() =>
      document.querySelector<HTMLFormElement>('main form')!.checkValidity(),
    ),
  ).toBe(true);
}

export async function assertSubmission(requests: FormRequest[], expected: FormRequest) {
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toEqual(expected);
}
