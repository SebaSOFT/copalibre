import { defineMiddleware } from 'astro:middleware';
import { requestApiStorage } from './lib/public-api-client.ts';

export const onRequest = defineMiddleware(async (context, next) => {
  if (context.isPrerendered) {
    return next();
  }
  const portHeader = context.request.headers.get('x-copalibre-api-port');
  const urlHeader = context.request.headers.get('x-copalibre-api-url');
  const apiBaseUrl = urlHeader || (portHeader ? `http://127.0.0.1:${portHeader}` : undefined);

  if (apiBaseUrl) {
    return requestApiStorage.run({ apiBaseUrl }, () => next());
  }
  return next();
});
