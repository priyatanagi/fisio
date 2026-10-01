import { useCallback, useEffect, useState } from 'react';

export type RouteId = 'generate' | 'batch' | 'profile' | 'history' | 'providers';

export const ROUTES: RouteId[] = ['generate', 'batch', 'profile', 'history', 'providers'];

export function parseHash(hash: string): RouteId {
  const cleaned = hash.replace(/^#\/?/, '').trim();
  return (ROUTES as string[]).includes(cleaned) ? (cleaned as RouteId) : 'generate';
}

export function navigateTo(route: RouteId): void {
  window.location.hash = `#/${route}`;
}

export function useHashRoute(): [RouteId, (route: RouteId) => void] {
  const [route, setRoute] = useState<RouteId>(() =>
    parseHash(typeof window === 'undefined' ? '' : window.location.hash)
  );

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((next: RouteId) => navigateTo(next), []);

  return [route, navigate];
}
