// Assemble the deployable site into dist/. Only files listed here are
// published — docs, data scripts, schema, and the poller stay private.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PUBLIC_ENTRIES = ['index.html', 'assets'];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = join(root, 'dist');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const entry of PUBLIC_ENTRIES) cpSync(join(root, entry), join(out, entry), { recursive: true });
  console.log('Built dist/ with: ' + PUBLIC_ENTRIES.join(', '));
}
