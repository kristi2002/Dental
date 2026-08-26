/**
 * Assembles `.next/standalone` into something that can actually be run.
 *
 * `output: 'standalone'` emits a server and its traced dependencies, and
 * deliberately leaves out two directories the tracer has no way to know are
 * needed: the compiled client assets in `.next/static`, and `public/`. The
 * Dockerfile copies both in as separate layers (see its `COPY --from=builder`
 * lines) — this is the same two copies, for anyone running the standalone
 * server outside a container.
 *
 * Why the end-to-end suite bothers, rather than using `next start`: `next start`
 * refuses this configuration outright, and the practice's server runs
 * `node server.js` on the standalone output. Testing the packaging that ships
 * costs one file, and a page that renders under `next start` while its
 * stylesheet 404s under standalone is exactly the failure a browser pass should
 * be the one to catch.
 */
import { cp, access } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const standalone = path.join(root, '.next', 'standalone');

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(standalone))) {
  console.error(
    `[stage-standalone] ${path.relative(root, standalone)} is missing — run \`npm run build\` first.`,
  );
  process.exit(1);
}

for (const from of [path.join('.next', 'static'), 'public']) {
  const source = path.join(root, from);
  if (!(await exists(source))) {
    // `public/` is created by the build's WebAssembly copy step, so its absence
    // means the build did not finish. Say which one rather than failing later
    // on a 404 nobody can trace back to here.
    console.error(`[stage-standalone] ${from} is missing — the build did not complete.`);
    process.exit(1);
  }
  await cp(source, path.join(standalone, from), { recursive: true, force: true });
  console.log(`[stage-standalone] ${from} → .next/standalone/${from}`);
}
