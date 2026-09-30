// Submits dist/firefox as a listed add-on on addons.mozilla.org.
// Needs AMO API credentials: https://addons.mozilla.org/developers/addon/api/key/
//   WEB_EXT_API_KEY=user:123:456 WEB_EXT_API_SECRET=… npm run submit:amo
// AMO has used two shapes for "categories"; if the first is rejected, the other is tried.
import { spawnSync } from 'node:child_process';

if (!process.env.WEB_EXT_API_KEY || !process.env.WEB_EXT_API_SECRET) {
  console.error('Set WEB_EXT_API_KEY and WEB_EXT_API_SECRET (from https://addons.mozilla.org/developers/addon/api/key/).');
  process.exit(2);
}

function sign(metadata) {
  console.log(`\n> web-ext sign --channel=listed --amo-metadata=${metadata}`);
  const r = spawnSync('npx', ['web-ext', 'sign', '--channel=listed', '--source-dir=dist/firefox', '--artifacts-dir=dist/amo',
    `--amo-metadata=${metadata}`, '--approval-timeout=0'], { stdio: ['inherit', 'pipe', 'pipe'], encoding: 'utf8', shell: process.platform === 'win32' });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  return { ok: r.status === 0, output: `${r.stdout}\n${r.stderr}` };
}

let result = sign('store/amo-metadata.json');
if (!result.ok && /categor/i.test(result.output)) result = sign('store/amo-metadata.legacy.json');
if (result.ok) {
  console.log('\nSubmitted. Check status at https://addons.mozilla.org/developers/addons');
} else {
  console.error('\nSubmission failed; see the output above.');
  process.exit(1);
}
