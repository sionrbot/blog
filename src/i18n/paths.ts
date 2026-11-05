import { withBase, withoutBase } from '../utils/base-path';

/** Extract the unprefixed page identity, never rewriting embedded segments. */
export function pageIdentity(path: string, base?: string): string {
  const pathname = withoutBase(path.split(/[?#]/, 1)[0], base);
  if (!pathname.startsWith('/') || pathname.startsWith('//')) {
    throw new Error(`Expected a site-relative page path: ${path}`);
  }
  return pathname === '/zh' ? '/' : pathname.replace(/^\/zh\//, '/');
}

/** Fully translated Contact pages are distinct; shared authored content prefers English URLs. */
export function canonicalPath(path: string, base?: string): string {
  const identity = pageIdentity(path, base);
  return withBase(
    identity.replace(/\/$/, '') === '/contact' ? path.split(/[?#]/, 1)[0] : identity,
    base,
  );
}

export const isErrorPage = (pathname: string, base?: string) =>
  /^\/(?:zh\/)?404(?:\.html)?\/?$/.test(withoutBase(pathname, base));
