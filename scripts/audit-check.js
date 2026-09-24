#!/usr/bin/env node
/**
 * scripts/audit-check.js
 *
 * Runs `npm audit --json` and fails only if there are high/critical
 * vulnerabilities NOT in the accepted exceptions list.
 *
 * To accept a new exception:
 *   1. Add the advisory ID to ACCEPTED_ADVISORIES below.
 *   2. Document the reason in docs/audit-exceptions.md.
 *   3. Set a review-by date (max 90 days out).
 */

'use strict';

const { execSync } = require('child_process');

// Advisory IDs that have been reviewed and accepted.
// Each entry MUST have a corresponding row in docs/audit-exceptions.md.
const ACCEPTED_ADVISORIES = new Set([
  // next@15.0.0 — critical/high — fix requires major next.js upgrade (see docs/audit-exceptions.md)
  1111372, 1111390, 1112653, 1113688, 1116376, 1117931,
  1118950, 1118954, 1118962, 1124172, 1124185, 1124193,

  // postcss (via next) — high — build-time only, not runtime exploitable
  1124252, 1139510,

  // sharp (via next) — high — fix requires upgrading next
  1124066, 1193725,

  // toml (via @stellar/stellar-sdk) — high — no upstream fix available
  1164824, 1164825,

  // vitest — critical — fix requires upgrading to v5 (breaking change)
  1139528,

  // vite (via vitest) — high — fix requires upgrading vitest (breaking change)
  1123525,

  // Additional next.js advisories
  1193677, 1193733,
]);

const FAIL_SEVERITIES = new Set(['high', 'critical']);

let auditJson;
try {
  const output = execSync('npm audit --json', { encoding: 'utf8' });
  auditJson = JSON.parse(output);
} catch (err) {
  // npm audit exits non-zero when vulnerabilities exist; the JSON is in stdout
  try {
    auditJson = JSON.parse(err.stdout);
  } catch {
    console.error('Failed to parse npm audit output');
    process.exit(1);
  }
}

const vulns = auditJson.vulnerabilities || {};
const blocking = [];

for (const [pkgName, vuln] of Object.entries(vulns)) {
  for (const via of vuln.via || []) {
    if (typeof via !== 'object') continue; // string refs are indirect, skip
    if (!FAIL_SEVERITIES.has(via.severity)) continue;
    if (ACCEPTED_ADVISORIES.has(via.source)) continue;

    blocking.push({
      advisory: via.source,
      package:  pkgName,
      severity: via.severity,
      title:    via.title,
      url:      via.url,
    });
  }
}

if (blocking.length === 0) {
  console.log('✓ No unaccepted high/critical vulnerabilities found.');
  process.exit(0);
}

console.error(`\n✗ Found ${blocking.length} unaccepted high/critical vulnerability(ies):\n`);
for (const v of blocking) {
  console.error(`  [${v.severity.toUpperCase()}] Advisory #${v.advisory} — ${v.package}`);
  console.error(`  ${v.title}`);
  console.error(`  ${v.url}\n`);
}
console.error(
  'To accept an exception, add the advisory ID to ACCEPTED_ADVISORIES in\n' +
  'scripts/audit-check.js and document the reason in docs/audit-exceptions.md.',
);
process.exit(1);
