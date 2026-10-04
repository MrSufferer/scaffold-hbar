import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, openSync, closeSync } from 'node:fs';
import path from 'node:path';

/** @type {Set<import('node:child_process').ChildProcess>} */
const activeCommands = new Set();
export function stopCommands() {
  for (const child of activeCommands) stopProcess(child);
}

/** Strip author configuration from generated commands, including all credentials. */
export function cleanEnvironment() {
  /** @type {NodeJS.ProcessEnv} */
  const env = { CI: '1', NEXT_TELEMETRY_DISABLED: '1', HARDHAT_DISABLE_TELEMETRY_PROMPT: 'true' };
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'SystemRoot']) if (process.env[key]) env[key] = process.env[key];
  return env;
}

/** @param {import('node:child_process').ChildProcess} child */
export function stopProcess(child) {
  if (!child.pid) return;
  try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Process group already exited. */ }
}

/** @param {string} command @param {string[]} args @param {{cwd:string, logFile?:string, env?:NodeJS.ProcessEnv, timeoutMs?:number}} options */
export function runCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    const fd = options.logFile ? openSync(options.logFile, 'w') : undefined;
    const child = spawn(command, args, { cwd: options.cwd, env: options.env || cleanEnvironment(), detached: true,
      stdio: ['ignore', fd ?? 'inherit', fd ?? 'inherit'] });
    activeCommands.add(child);
    if (fd !== undefined) closeSync(fd);
    const timer = setTimeout(() => { stopProcess(child); reject(new Error(`${command} timed out`)); }, options.timeoutMs || 600_000);
    child.once('error', error => { activeCommands.delete(child); clearTimeout(timer); reject(error); });
    child.once('exit', (code, signal) => {
      activeCommands.delete(child);
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`${command} exited ${code ?? signal}`));
      else resolve(code);
    });
  });
}

/** @typedef {{name:string, command:string, args:string[]}} CheckCommand */
/** @param {{cwd:string, reportFile:string, commands:CheckCommand[], metadata?:Record<string,unknown>}} options */
export async function runChecks(options) {
  const reportDir = path.dirname(options.reportFile);
  mkdirSync(reportDir, { recursive: true });
  const report = {
    ...options.metadata, date: new Date().toISOString(), status: 'running',
    stages: options.commands.map(command => ({ ...command, status: 'not-run', log: '', error: '' })),
  };
  const save = () => writeFileSync(options.reportFile, JSON.stringify(report, null, 2) + '\n');
  save();
  for (const stage of report.stages) {
    stage.status = 'running';
    stage.log = path.join(reportDir, `${stage.name}.log`);
    save();
    try {
      console.log(`VERIFY ${stage.name}: ${stage.command} ${stage.args.join(' ')}`);
      await runCommand(stage.command, stage.args, { cwd: options.cwd, logFile: stage.log });
      stage.status = 'passed';
      save();
    } catch (error) {
      stage.status = 'failed';
      stage.error = String(error);
      report.status = 'failed';
      save();
      throw new Error(`${stage.name}: ${String(error)}`, { cause: error });
    }
  }
  report.status = 'passed';
  save();
  return report;
}
