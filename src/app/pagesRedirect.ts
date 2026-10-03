/**
 * Возвращает маршрут, который GitHub Pages передал через `?redirect=` из
 * `404.html`. Принимаем только локальный путь с одним ведущим слэшем.
 */
export const restorePagesRoute = (value: string): string | null => {
  const url = new URL(value);
  const redirect = url.searchParams.get('redirect');
  if (!redirect?.startsWith('/') || redirect.startsWith('//')) return null;

  const configuredBase = import.meta.env.BASE_URL;
  const base = configuredBase === '/' ? url.pathname : configuredBase;
  const normalizedBase = `/${base.split('/').filter(Boolean).join('/')}/`;
  const route = redirect.startsWith(normalizedBase)
    ? redirect.slice(normalizedBase.length)
    : redirect.slice(1);
  return `${normalizedBase}${route}`;
};
