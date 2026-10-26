/**
 * Vercel serverless entry point for the NASA Space Explorer API.
 *
 * Every API route (APOD, ISS, NeoWs, EPIC, exoplanets, news, Earth Intelligence
 * Lab, NOVA, …) is defined on the Express app in `server.ts`. When the app runs
 * standalone (`npm run dev` / `npm start`) that file starts its own listener;
 * on Vercel there is no long-running process, so the platform invokes the
 * exported app as a serverless function instead.
 *
 * `vercel.json` rewrites every `/api/*` request without a dedicated function
 * (e.g. the existing `api/nova/*` handlers) to this entry, preserving the
 * original request URL so the Express routes match exactly as they do locally.
 */
import { app } from '../server';

export default app;
