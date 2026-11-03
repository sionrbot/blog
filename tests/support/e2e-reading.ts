import type { Browser } from '@e2e-dev/web';
import { expect } from 'e2e';

export const readingCheckpoints = [
  {
    selector: '.table-scroll',
    assertion:
      'The visible table has legible Identifier and Value column headers and a legible Wide row label. Its text has visible contrast against its background and is not obscured by another element. The long Value may extend horizontally inside the table; the whole value need not fit onscreen.',
  },
  {
    selector: '.prose pre',
    assertion:
      'The visible code block contains discernible text with visible contrast against its background, without another element covering the visible line. The long unbroken line may continue horizontally inside the code block; the whole line need not fit onscreen.',
  },
  {
    selector: '.katex-display',
    assertion:
      'The visible mathematical expression has discernible x symbols, subscripts and plus signs with visible contrast against its background, without overlapping surrounding content. The long expression may continue horizontally inside its own area; the entire equation need not fit onscreen.',
  },
] as const;

/** Position the actual content, not merely its heading, inside the screenshot. */
export async function positionReadingContent(browser: Browser, selector: string) {
  const content = browser.locator(selector);
  await expect(content).toHaveCount(1);
  const bounds = await browser.evaluate(async (query) => {
    await document.fonts.ready;
    const node = document.querySelector<HTMLElement>(query)!;
    node.scrollIntoView({ block: 'center', behavior: 'instant' });
    const rect = node.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height,
      viewportHeight: innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
    };
  }, selector);
  expect(bounds.height).toBeGreaterThan(0);
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight);
  expect(bounds.documentWidth).toBeLessThanOrEqual(bounds.viewportWidth + 1);
}
