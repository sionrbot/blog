import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Run the emitted search runtime and its real WebAssembly in a fresh Node process.
// Only transport and the HTML language are supplied; indexing/search are not mocked.
const [directory, baseUrl, locale, queries] = process.argv.slice(2);
const basePath = pathToFileURL(`${directory}/`).href;
globalThis.document = {
  currentScript: null,
  querySelector: () => ({ getAttribute: () => locale }),
};
globalThis.fetch = async (url) => new Response(await readFile(new URL(url)));
const pagefind = await import(new URL('pagefind.js', basePath).href);
await pagefind.options({ basePath, baseUrl });
try {
  const output = [];
  for (const query of JSON.parse(queries)) {
    const search = await pagefind.search(query);
    const results = await Promise.all(search.results.map((result) => result.data()));
    output.push({ query, results });
  }
  process.stdout.write(JSON.stringify(output));
} finally {
  await pagefind.destroy();
}
