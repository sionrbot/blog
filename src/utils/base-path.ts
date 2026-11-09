/** Remove the deployment prefix only at a complete path-segment boundary. */
export function withoutBase(path: string, base = import.meta.env?.BASE_URL ?? '/'): string {
  const prefix = base.replace(/\/$/, '');
  if (!prefix) return path;
  if (path === prefix) return '/';
  return path.startsWith(`${prefix}/`) ? path.slice(prefix.length) : path;
}

/** Prepend the deployment prefix to a site-relative path. */
export function withBase(path: string, base = import.meta.env?.BASE_URL ?? '/'): string {
  return `${base.replace(/\/$/, '')}${path}`;
}
