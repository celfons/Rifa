import app from './hono-app';

type Bindings = {
  ASSETS?: Fetcher;
};

const apiLikePath = (pathname: string) => pathname.startsWith('/api/') || pathname === '/api' || pathname === '/health';

export default {
  async fetch(request: Request, env: Bindings, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (apiLikePath(url.pathname)) {
      return app.fetch(request, env, ctx);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Static assets binding (ASSETS) não configurado.', { status: 500 });
  }
};
