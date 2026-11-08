// Check Git candidates without printing secret values. Run before staging/push.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  cwd: root, encoding: 'utf8',
}).split('\0').filter(Boolean))];

const knownSecrets = [];
for (const relative of ['.env', 'packages/server/.env', 'packages/mobile/.env']) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([\w]+)\s*=\s*(.*?)\s*$/);
    if (!match || !/key|secret|token|password|credential/i.test(match[1])) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
    if (value.length >= 16) knownSecrets.push(value);
  }
}

const forbiddenName = /(?:^|\/)(?:\.env(?:\..*)?|credentials\.json|service[-_]?account[^/]*\.json|google-services\.json|GoogleService-Info\.plist|key\.properties|keystore\.properties|local\.properties)$|\.(?:pem|key|p12|pfx|jks|keystore)$/i;
const tokenPatterns = [
  /\bsbp_[a-zA-Z0-9]{20,}\b/,
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{20,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\bsb_secret_[A-Za-z0-9_-]{15,}\b/,
];
const findings = [];
for (const file of files) {
  if (forbiddenName.test(file) && !/(?:^|\/)\.env\.example$/.test(file)) {
    findings.push(`${file}: sensitive file must not be committed`);
    continue;
  }
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue;
  const data = fs.readFileSync(absolute);
  if (data.includes(0)) continue;
  const lines = data.toString('utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (knownSecrets.some((secret) => line.includes(secret)) || tokenPatterns.some((p) => p.test(line))) {
      findings.push(`${file}:${i + 1}: possible credential (value withheld)`);
    }
  });
}
if (findings.length) {
  console.error('Secret check FAILED. Do not commit or push these files:\n' + findings.join('\n'));
  process.exit(1);
}
console.log(`Secret check passed for ${files.length} Git candidate files. No values printed.`);
