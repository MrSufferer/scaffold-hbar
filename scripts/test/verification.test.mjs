import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runChecks } from '../verification.mjs';

test('a failing generated command fails the gate and later stages cannot report success', async () => {
  const destination = mkdtempSync(path.join(os.tmpdir(), 'invoice-failure-'));
  const reportFile = path.join(destination, 'report.json');
  try {
    await assert.rejects(runChecks({ cwd: destination, reportFile, commands: [
      { name: 'test', command: process.execPath, args: ['-e', 'process.exit(23)'] },
      { name: 'build', command: process.execPath, args: ['-e', 'process.exit(0)'] },
    ] }), /test.*23/);
    const report = JSON.parse(readFileSync(reportFile, 'utf8'));
    assert.equal(report.status, 'failed');
    assert.equal(report.stages[0].status, 'failed');
    assert.equal(report.stages[1].status, 'not-run');
  } finally { rmSync(destination, { recursive: true, force: true }); }
});
