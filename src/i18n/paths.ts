/** Extract the unprefixed page identity, never rewriting embedded segments. */
export function pageIdentity(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0];
  if (!pathname.startsWith('/') || pathname.startsWith('//')) {
    throw new Error(`Expected a site-relative page path: ${path}`);
  }
  return pathname === '/zh' ? '/' : pathname.replace(/^\/zh\//, '/');
}

/** Fully translated Contact pages are distinct; shared authored content prefers English URLs. */
export function canonicalPath(path: string): string {
  const identity = pageIdentity(path);
  return identity.replace(/\/$/, '') === '/contact' ? path.split(/[?#]/, 1)[0] : identity;
}

export const isErrorPage = (pathname: string) => /^\/(?:zh\/)?404(?:\.html)?\/?$/.test(pathname);
