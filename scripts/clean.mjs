// Cross-platform clean script (works in PowerShell, CMD, and POSIX shells).
// Removes the Vite production output directory without relying on `rm -rf`.
import fs from 'node:fs';

const DIST = 'dist';

try {
  fs.rmSync(DIST, { recursive: true, force: true });
  console.log(`[clean] removed ${DIST}/`);
} catch (err) {
  console.error(`[clean] failed to remove ${DIST}/:`, err);
  process.exit(1);
}
