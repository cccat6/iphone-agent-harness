// Public pages and explicitly shared Skill packages. Private Harness state stays local.
import community from './api/worker.js';
const pages = new Set(['/main', '/skills', '/flash']);
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      url.pathname = url.pathname.slice(4) || '/';
      return community.fetch(new Request(url, request), env, ctx);
    }
    const legacy = {'/home':'/main', '/harness':'/'};
    if (legacy[url.pathname]) return Response.redirect(new URL(legacy[url.pathname], url), 308);
    if (url.pathname.endsWith('/') && pages.has(url.pathname.slice(0, -1))) {
      url.pathname = url.pathname.slice(0, -1);
      return Response.redirect(url, 308);
    }
    if (pages.has(url.pathname)) {
      if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed', {status:405, headers:{Allow:'GET, HEAD'}});
      url.pathname = '/';
      return env.ASSETS.fetch(new Request(url, request));
    }
    return env.ASSETS.fetch(request);
  },
};
