import { handle } from 'hono/cloudflare-pages';
import app from '../src/hono-app';

export const onRequest = handle(app);
