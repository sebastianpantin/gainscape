interface LaunchFacts {
  targetURL: string | undefined;
  origin: string;
  currentPath: string;
}

export function launchTargetPath({ targetURL, origin, currentPath }: LaunchFacts): string | null {
  if (targetURL === undefined) return null;
  let url: URL;
  try {
    url = new URL(targetURL);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  const path = `${url.pathname}${url.search}${url.hash}`;
  return path === currentPath ? null : path;
}
