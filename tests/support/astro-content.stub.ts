// Only the unit test project aliases astro:content here. Publishing must use real Astro builds.
export function getCollection(): never {
  throw new Error('astro:content is unavailable in unit tests; use a real Astro build instead.');
}
