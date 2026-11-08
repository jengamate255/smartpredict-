// Small ADB helper for repeatable native UI checks (no app test hooks).
// node scripts/emulator.cjs dump | tap "label" | wait "text" | screenshot name
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const adb = process.env.ADB_PATH || 'C:/Android/Sdk/platform-tools/adb.exe';
const device = process.env.ANDROID_SERIAL || 'emulator-5554';
function run(...args) { return execFileSync(adb, ['-s', device, ...args], { encoding: 'utf8', timeout: 20000 }); }
function nodes() {
  run('shell', 'uiautomator', 'dump', '/sdcard/kesho-ui.xml');
  const xml = run('shell', 'cat', '/sdcard/kesho-ui.xml');
  return [...xml.matchAll(/<node\s+([^>]+)>?/g)].map((match) => {
    const attrs = Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2].replace(/&amp;/g, '&')]));
    return attrs;
  });
}
async function main() {
  const [command = 'dump', value] = process.argv.slice(2);
  if (command === 'dump') return console.log(nodes().filter((n) => n.text || n['content-desc']).map((n) => `${n.text || n['content-desc']} ${n.bounds}`).join('\n'));
  if (command === 'tap') {
    const list = nodes();
    const node = list.find((n) => n['content-desc'] === value || n.text === value);
    if (!node) throw new Error(`Cannot find: ${value}`);
    const [x1, y1, x2, y2] = node.bounds.match(/\d+/g).map(Number);
    run('shell', 'input', 'tap', String(Math.round((x1 + x2) / 2)), String(Math.round((y1 + y2) / 2)));
    return console.log(`Tapped ${value}`);
  }
  if (command === 'wait') {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      try {
        if (nodes().some((n) => `${n.text} ${n['content-desc']}`.toLowerCase().includes(value.toLowerCase()))) return console.log(`Visible: ${value}`);
      } catch {
        // Android can return a null root during an activity transition.
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Timed out waiting for: ${value}`);
  }
  if (command === 'screenshot') {
    const dest = path.join(process.env.LOCALAPPDATA, 'Temp', 'opencode', `${value || 'kesho'}.png`);
    run('shell', 'screencap', '-p', '/sdcard/kesho.png');
    run('pull', '/sdcard/kesho.png', dest);
    return console.log(dest);
  }
  throw new Error(`Unknown command: ${command}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
