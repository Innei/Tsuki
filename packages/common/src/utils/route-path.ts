export interface BuildRoutePathOptions {
  bypassGlobalPrefix?: boolean;
  controllerPrefix?: string;
  globalPrefix?: string;
  routePath?: string;
}

export function buildRoutePath(options: BuildRoutePathOptions): string {
  const pieces = [options.routePath];

  if (options.controllerPrefix) {
    pieces.unshift(options.controllerPrefix);
  }
  if (!options.bypassGlobalPrefix && options.globalPrefix) {
    pieces.unshift(options.globalPrefix);
  }

  const normalized = pieces
    .map((segment) => segment?.trim())
    .filter((segment): segment is string => Boolean(segment))
    .map((segment) => (segment.startsWith('/') ? segment : `/${segment}`));

  const joined = normalized.join('').replaceAll(/[/\\]+/g, '/');
  if (joined.length > 1 && joined.endsWith('/')) {
    return joined.slice(0, -1);
  }

  return joined || '/';
}
