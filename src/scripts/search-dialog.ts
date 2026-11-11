import { setupSearch } from './search';

export function setupSearchDialog(dialog: HTMLDialogElement) {
  const root = dialog.querySelector<HTMLElement>('[data-search]')!;
  const input = dialog.querySelector<HTMLInputElement>('#search-query')!;
  const clear = dialog.querySelector<HTMLButtonElement>('[data-search-clear]')!;
  const updateClear = () => {
    clear.hidden = input.value.length === 0;
  };
  input.addEventListener('input', updateClear);
  clear.addEventListener('click', () => {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  });
  let search: ReturnType<typeof setupSearch> | undefined;
  let composing = false;

  const open = () => {
    if (dialog.open) return;
    search ??= setupSearch(root);
    // Close the language menu so it does not remain open behind the modal.
    document.querySelectorAll<HTMLDetailsElement>('[data-language-switcher]').forEach((menu) => {
      menu.open = false;
    });
    updateClear();
    dialog.showModal();
    search.resume();
  };

  document.querySelectorAll<HTMLButtonElement>('[data-search-open]').forEach((button) => {
    button.disabled = false;
    button.addEventListener('click', open);
  });

  input.addEventListener('compositionstart', () => {
    composing = true;
  });
  input.addEventListener('compositionend', () => {
    composing = false;
  });
  dialog.addEventListener('cancel', (event) => {
    if (composing) event.preventDefault();
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.isComposing || composing || event.altKey || event.ctrlKey || event.metaKey) return;
    // Search inputs consume Escape to clear their value before the dialog can close.
    // Keep the query for reopening and let the IME handle Escape while composing.
    if (event.key === 'Escape' && event.target === input) {
      event.preventDefault();
      dialog.close();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('[data-result-link]'));
    const current = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (document.activeElement !== input && current === -1) return;
    if (!links.length) return;
    event.preventDefault();
    if (current === 0 && event.key === 'ArrowUp') {
      input.focus();
      return;
    }
    const next =
      current === -1
        ? event.key === 'ArrowDown'
          ? 0
          : links.length - 1
        : Math.min(links.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1));
    links[next].focus({ preventScroll: true });
    links[next].scrollIntoView({ block: 'nearest' });
  });

  // closedby is progressive enhancement; preserve light dismiss on older browsers.
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    const outside = (event: PointerEvent) => {
      const rect = dialog.getBoundingClientRect();
      return (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      );
    };
    let pressedOutside = false;
    dialog.addEventListener('pointerdown', (event) => {
      pressedOutside = outside(event);
    });
    dialog.addEventListener('pointerup', (event) => {
      if (pressedOutside && outside(event)) dialog.close();
      pressedOutside = false;
    });
  }

  dialog.addEventListener('close', () => {
    search?.suspend();
    composing = false;
  });
}
