/**
 * Vercel serverless function entry source.
 *
 * Vercel's zero-config Node builder transpiles `api/*.ts` file-by-file into
 * native ESM without bundling, so extensionless relative imports (e.g.
 * `'../server'`) fail at cold start with ERR_MODULE_NOT_FOUND — the platform
 * then returns FUNCTION_INVOCATION_FAILED for every route.
 *
 * Instead, `npm run build` bundles this entry — and the whole Express app in
 * server.ts — into a single self-contained ESM file at `api/index.js` with
 * esbuild. All relative specifiers are resolved at build time; only bare
 * packages stay external and are resolved from node_modules at runtime.
 *
 * The standalone server in server.ts keeps its own listener startup guarded
 * behind a direct-execution check, so importing the app here has no
 * side effects on the serverless runtime.
 */
import { app } from '../server';

export default app;
