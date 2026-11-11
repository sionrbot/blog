import { formatMessage } from '../i18n/t';

interface SearchData {
  excerpt: string;
  meta: {
    title: string;
    description: string;
    slug: string;
    lang: string;
    pubDate: string;
    tags: string;
  };
}

interface SearchResult {
  data(): Promise<SearchData>;
}

interface SearchIndex {
  options(options: { baseUrl: string }): Promise<void>;
  search(query: string): Promise<{ results: SearchResult[] }>;
}

/** Keep Pagefind's match markers, treating all other excerpt markup as text. */
function excerptFragment(excerpt: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = excerpt;
  const copy = (node: Node, target: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      target.appendChild(document.createTextNode(node.textContent ?? ''));
    } else if (node instanceof Element && node.tagName === 'MARK') {
      const mark = document.createElement('mark');
      mark.textContent = node.textContent;
      target.appendChild(mark);
    } else {
      for (const child of node.childNodes) copy(child, target);
    }
  };
  const fragment = document.createDocumentFragment();
  copy(template.content, fragment);
  return fragment;
}

export function setupSearch(root: HTMLElement) {
  const form = root.querySelector<HTMLFormElement>('form')!;
  const input = root.querySelector<HTMLInputElement>('input')!;
  const status = root.querySelector<HTMLElement>('[data-search-status]')!;
  const list = root.querySelector<HTMLOListElement>('[data-search-results]')!;
  const more = root.querySelector<HTMLButtonElement>('[data-search-more]')!;
  const template = root.querySelector<HTMLTemplateElement>('[data-search-result]')!;
  const messages = root.dataset;
  const dateFormat = new Intl.DateTimeFormat(document.documentElement.lang, {
    dateStyle: 'long',
    timeZone: 'UTC',
  });
  let indexPromise: Promise<SearchIndex> | undefined;
  let results: SearchResult[] = [];
  let shown = 0;
  let version = 0;
  let timer: ReturnType<typeof setTimeout>;
  let composing = false;

  const loadIndex = () => {
    indexPromise ??= (async () => {
      const index: SearchIndex = await import(/* @vite-ignore */ messages.bundle!);
      await index.options({ baseUrl: messages.base! });
      return index;
    })().catch((error: unknown) => {
      indexPromise = undefined;
      throw error;
    });
    return indexPromise;
  };

  const appendResults = async (request: number) => {
    more.disabled = true;
    try {
      const batch = await Promise.all(
        results.slice(shown, shown + 10).map((result) => result.data()),
      );
      if (request !== version) return;
      const fragment = document.createDocumentFragment();
      for (const result of batch) {
        const item = template.content.cloneNode(true) as DocumentFragment;
        const link = item.querySelector<HTMLAnchorElement>('[data-result-link]')!;
        link.textContent = result.meta.title;
        link.lang = result.meta.lang;
        link.href = `${messages.postBase}${result.meta.slug.split('/').map(encodeURIComponent).join('/')}/`;
        const time = item.querySelector('time')!;
        time.dateTime = result.meta.pubDate;
        time.textContent = dateFormat.format(new Date(result.meta.pubDate));
        const excerpt = item.querySelector<HTMLElement>('[data-result-excerpt]')!;
        excerpt.lang = result.meta.lang;
        excerpt.append(excerptFragment(result.excerpt || result.meta.description));
        const tags = item.querySelector<HTMLElement>('[data-result-tags]')!;
        tags.lang = result.meta.lang;
        tags.textContent = (JSON.parse(result.meta.tags) as string[])
          .map((tag) => `#${tag}`)
          .join(' · ');
        fragment.append(item);
      }
      list.append(fragment);
      shown += batch.length;
      more.hidden = shown >= results.length;
      status.textContent = formatMessage(messages.count!, { count: results.length });
    } finally {
      if (request === version) more.disabled = false;
    }
  };

  const search = async (request: number) => {
    const query = input.value.trim();
    list.replaceChildren();
    more.hidden = true;
    shown = 0;
    if (!query) {
      more.disabled = false;
      status.textContent = messages.prompt!;
      return;
    }
    status.textContent = messages.loading!;
    try {
      const index = await loadIndex();
      if (request !== version) return;
      const found = await index.search(query);
      if (request !== version) return;
      results = found.results;
      if (!results.length) {
        more.disabled = false;
        status.textContent = messages.empty!;
      } else await appendResults(request);
    } catch {
      if (request === version) status.textContent = messages.error!;
    }
  };

  const schedule = (immediate = false) => {
    clearTimeout(timer);
    const request = ++version;
    // Old result batches must not be started under the new query's generation.
    more.hidden = true;
    more.disabled = true;
    list.replaceChildren();
    if (composing) return;
    if (immediate) void search(request);
    else timer = setTimeout(() => void search(request), 180);
  };
  input.addEventListener('input', () => schedule());
  input.addEventListener('compositionstart', () => {
    composing = true;
    schedule();
  });
  input.addEventListener('compositionend', () => {
    composing = false;
    schedule();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!composing) schedule(true);
  });
  more.addEventListener('click', () => {
    const request = version;
    void appendResults(request).catch(() => {
      if (request === version) status.textContent = messages.error!;
    });
  });
  return {
    suspend() {
      clearTimeout(timer);
      ++version;
      composing = false;
    },
    resume() {
      // An interrupted query or batch needs a fresh run; settled results stay in place.
      if (more.disabled) schedule(true);
    },
  };
}
