import { expect, it } from 'vite-plus/test';
import { getCollection } from '../../support/astro-content.stub';

it('rejects collection access in the unit test boundary', () => {
  expect(() => getCollection()).toThrow(
    'astro:content is unavailable in unit tests; use a real Astro build instead.',
  );
});
