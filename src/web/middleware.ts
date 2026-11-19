// The Vercel Routing Middleware entry (web build spec §5.3), bundled by scripts/web/web-output.ts into
// .vercel/output/functions/_middleware.func/index.js. FTLITE_PASSCODE and FTLITE_COOKIE_SECRET are the project's env vars.
import { handlePasscode } from './passcode';

export default function middleware(request: Request): Promise<Response> {
  return handlePasscode(request, { passcode: process.env.FTLITE_PASSCODE, secret: process.env.FTLITE_COOKIE_SECRET,
    nowMs: () => Date.now(), sleep: ms => new Promise(done => setTimeout(done, ms)) });
}
