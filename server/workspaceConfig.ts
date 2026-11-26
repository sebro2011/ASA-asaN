/**
 * Workspace cloud configuration — `GET /api/workspace/config`.
 *
 * Returns only the publishable Supabase URL + key so the browser can create its
 * own auth client. The validation helpers are kept in a dependency-free module
 * so server auth can reuse them without loading Express.
 */
import { Router } from 'express';
import { readWorkspaceCloudConfig } from './workspaceCloudConfig.ts';

export { isPublishableKey, readWorkspaceCloudConfig } from './workspaceCloudConfig.ts';
export type { WorkspaceCloudConfig } from './workspaceCloudConfig.ts';

export const workspaceConfigRouter = Router();

workspaceConfigRouter.get('/config', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(readWorkspaceCloudConfig());
});
