import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { validateSource, auditPackaging } from "./validate-template.mjs";
import {
  cleanEnvironment,
  runCommand,
  runChecks,
  stopProcess,
  stopCommands,
} from "./verification.mjs";

const { values } = parseArgs({
  options: {
    template: { type: "string", default: "MrSufferer/scaffold-hbar" },
    ref: { type: "string" },
    local: { type: "boolean", default: false },
    report: { type: "string", default: "verification-report.json" },
  },
});
const reportFile = path.resolve(values.report);
const reportDir = path.dirname(reportFile);
mkdirSync(reportDir, { recursive: true });
const temporary = mkdtempSync(path.join(os.tmpdir(), "hbar-invoices-verify-"));
const sourceDir = path.join(temporary, "source");
const projectDir = path.join(temporary, "generated");
mkdirSync(sourceDir);
const metadata = {
  source: values.template,
  requestedRef: values.ref || "public-default",
  sourceCommit: "",
  mode: values.local
    ? "local-candidate"
    : values.ref
      ? "public-candidate"
      : "public-default",
  node: process.version,
  npm: execFileSync("npm", ["--version"], { encoding: "utf8" }).trim(),
  cli: "",
  date: new Date().toISOString(),
  status: "running",
  stages:
    /** @type {Array<{name:string,status:string,command?:string[],error?:string}>} */ ([]),
};
const save = () =>
  writeFileSync(reportFile, JSON.stringify(metadata, null, 2) + "\n");
/** @type {import('node:child_process').ChildProcess | undefined} */
let server;
let aborted = false;
const onSignal = () => {
  aborted = true;
  stopCommands();
  if (server) stopProcess(server);
  metadata.status = "failed";
  metadata.stages.push({ name: "interrupted", status: "failed" });
  save();
  rmSync(temporary, { recursive: true, force: true });
  process.exit(1);
};
process.once("SIGINT", onSignal);
process.once("SIGTERM", onSignal);

/** @param {string} name @param {()=>Promise<void>|void} action @param {string[]=} command */
async function stage(name, action, command) {
  const result = { name, status: "running", command, error: "" };
  metadata.stages.push(result);
  save();
  console.log(`VERIFY ${name}`);
  try {
    await action();
    result.status = "passed";
  } catch (error) {
    result.status = "failed";
    result.error = String(error);
    throw error;
  } finally {
    save();
  }
}

/** @param {string} url */
async function download(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(120_000),
    headers: { "User-Agent": "hbar-invoices-verifier" },
  });
  assert(response.ok, `${url}: HTTP ${response.status}`);
  return response;
}

/** Assert generated workspace commands survived CLI transformations. */
function checkGenerated() {
  const pkg = JSON.parse(
    readFileSync(path.join(projectDir, "package.json"), "utf8"),
  );
  assert.deepEqual(pkg.workspaces, ["packages/hardhat", "packages/nextjs"]);
  for (const key of [
    "test",
    "lint",
    "build",
    "check-types",
    "dev",
    "start",
    "verify:template",
    "format",
  ]) {
    assert(
      typeof pkg.scripts[key] === "string" && pkg.scripts[key].trim(),
      `Generated script missing: ${key}`,
    );
  }
  assert(
    existsSync(path.join(projectDir, "package-lock.json")),
    "Generated lockfile required",
  );
  assert(
    !existsSync(path.join(projectDir, "template.json")),
    "CLI should remove the source manifest",
  );
  auditPackaging(projectDir);
  for (const guide of ["README.md", "AGENTS.md"]) {
    const text = readFileSync(path.join(projectDir, guide), "utf8");
    for (const marker of ["verify:template", "24.10.0", "testnet"])
      assert(text.includes(marker), `Generated ${guide} lost ${marker}`);
  }
  const walkthrough = readFileSync(
    path.join(projectDir, "docs/invoice-creation.md"),
    "utf8",
  );
  for (const marker of [
    "Cancel with MetaMask",
    "Check cancellation transaction",
    "InvoiceAlreadyCancelled",
    "Cancelled",
  ])
    assert(
      walkthrough.includes(marker),
      `Generated cancellation guide lost ${marker}`,
    );
  assert(
    readFileSync(path.join(projectDir, "AGENTS.md"), "utf8").includes(
      "pending cancellation",
    ),
    "Generated agent guide lost cancellation recovery",
  );
  for (const marker of [
    "payment failure actions",
    "wallet-event invalidation",
    "pre-submit rejection",
  ]) {
    assert(
      readFileSync(path.join(projectDir, "AGENTS.md"), "utf8").includes(marker),
      `Generated agent guide lost ${marker}`,
    );
  }
  const payment = readFileSync(
    path.join(projectDir, "docs/invoice-payment.md"),
    "utf8",
  );
  for (const marker of [
    "Payment failure actions",
    "Insufficient funds",
    "Wallet rejection before submission",
    "Confirmed on-chain revert",
    "Changed oracle round",
    "Expired quote",
    "Stale or invalid feed",
  ]) {
    assert(
      payment.includes(marker),
      `Generated payment failure guide lost ${marker}`,
    );
  }
  for (const marker of [
    "Estimate payment network fee",
    "Approve exact quote and pay with MetaMask",
    "Check payment transaction",
    "InvoiceSettled",
    "weibars",
    "tinybars",
  ])
    assert(
      payment.includes(marker),
      `Generated settlement guide lost ${marker}`,
    );
  assert(
    readFileSync(path.join(projectDir, "AGENTS.md"), "utf8").includes(
      "docs/invoice-payment.md",
    ),
    "Generated agent guide lost settlement boundary",
  );
}

async function boot() {
  const port = await new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const address = socket.address();
      assert(address && typeof address === "object");
      socket.close(() => resolve(address.port));
    });
  });
  const bootStage = metadata.stages.find(
    (result) => result.name === "production-boot",
  );
  if (bootStage)
    bootStage.command = [
      "npm",
      "run",
      "start",
      "--",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ];
  save();
  server = spawn(
    "npm",
    ["run", "start", "--", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: projectDir,
      env: cleanEnvironment(),
      detached: true,
      stdio: "ignore",
    },
  );
  let spawnError;
  server.once("error", (error) => {
    spawnError = error;
  });
  const deadline = Date.now() + 60_000;
  for (const route of [
    "/",
    "/setup",
    "/merchant",
    "/deploy",
    "/invoice/296/0x1111111111111111111111111111111111111111/1",
  ]) {
    let healthy = false;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      assert(
        server.exitCode === null,
        "Production server exited before route checks",
      );
      try {
        const response = await fetch(`http://127.0.0.1:${port}${route}`, {
          signal: AbortSignal.timeout(2000),
        });
        if (response.status === 200) {
          const html = await response.text();
          for (const marker of [
            "HBAR Invoices",
            "Hedera testnet",
            "Configuration needed",
          ]) {
            if (
              marker !== "Configuration needed" ||
              ["/", "/setup", "/merchant"].includes(route)
            )
              assert(html.includes(marker), `${route} missing ${marker}`);
          }
          if (route === "/setup")
            for (const marker of [
              "296",
              "No invoice contract configured",
              "Local checks",
            ]) {
              assert(html.includes(marker), `/setup missing ${marker}`);
            }
          healthy = true;
          break;
        }
      } catch (error) {
        if (String(error).includes("missing")) throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert(healthy, `Production route ${route} did not become healthy`);
    metadata.stages.push({ name: `HTTP ${route}`, status: "passed" });
  }
}

try {
  save();
  await stage("runtime", () => {
    assert.equal(
      process.version,
      "v24.10.0",
      "Use the pinned Node version from .nvmrc",
    );
    assert.equal(metadata.npm, "11.6.1", "Use the pinned npm version");
  });
  await stage("export-source", async () => {
    if (values.local) {
      const ref = values.ref || "HEAD";
      metadata.sourceCommit = execFileSync(
        "git",
        ["rev-parse", `${ref}^{commit}`],
        { encoding: "utf8" },
      ).trim();
      const archive = execFileSync(
        "git",
        ["archive", "--format=tar", metadata.sourceCommit],
        { maxBuffer: 50 * 1024 * 1024 },
      );
      execFileSync("tar", ["-xf", "-", "-C", sourceDir], { input: archive });
    } else {
      assert(
        /^[\w.-]+\/[\w.-]+$/.test(values.template),
        "template must be owner/repo; use --ref for a candidate",
      );
      const repo = await (
        await download(`https://api.github.com/repos/${values.template}`)
      ).json();
      const ref = values.ref || repo.default_branch;
      const commit = await (
        await download(
          `https://api.github.com/repos/${values.template}/commits/${encodeURIComponent(ref)}`,
        )
      ).json();
      metadata.sourceCommit = commit.sha;
      const archive = await (
        await download(
          `https://codeload.github.com/${values.template}/tar.gz/${commit.sha}`,
        )
      ).arrayBuffer();
      const archivePath = path.join(temporary, "source.tgz");
      writeFileSync(archivePath, Buffer.from(archive));
      execFileSync("tar", [
        "-xzf",
        archivePath,
        "--strip-components=1",
        "-C",
        sourceDir,
      ]);
    }
  });
  await stage("source-manifest-and-packaging", () => validateSource(sourceDir));
  metadata.cli = execFileSync(
    "npm",
    ["view", "create-scaffold-hbar@latest", "version"],
    { env: cleanEnvironment(), encoding: "utf8", timeout: 120_000 },
  ).trim();
  assert.equal(
    metadata.cli,
    "0.4.1",
    "Published CLI changed: update the locked schema adapter and revalidate",
  );
  const template =
    values.ref && !values.local
      ? `${values.template}#${metadata.sourceCommit}`
      : values.template;
  const args = [
    "create",
    "scaffold-hbar@latest",
    "--",
    "generated",
    "--template",
    template,
    "--frontend",
    "nextjs-app",
    "--solidity-framework",
    "hardhat",
    "--package-manager",
    "npm",
    "--network",
    "testnet",
    "--skip-install",
    "--skip-hedera-skills",
    "--yes",
  ];
  await stage(
    "published-generation",
    () =>
      runCommand("npm", args, {
        cwd: temporary,
        logFile: path.join(reportDir, "generation.log"),
        env: {
          ...cleanEnvironment(),
          ...(values.local
            ? { CREATE_SCAFFOLD_HBAR_TEMPLATE_DIR: sourceDir }
            : {}),
        },
      }).then(() => {}),
    ["npm", ...args],
  );
  await stage("generated-artifacts", checkGenerated);
  const generatedReport = path.join(reportDir, "generated-checks.json");
  await stage("generated-checks", async () => {
    await runChecks({
      cwd: projectDir,
      reportFile: generatedReport,
      metadata: { ...metadata, sourceManifestRequired: false },
      commands: [
        { name: "install", command: "npm", args: ["ci"] },
        { name: "format", command: "npm", args: ["run", "format"] },
        { name: "typecheck", command: "npm", args: ["run", "check-types"] },
        { name: "test", command: "npm", args: ["test"] },
        { name: "lint", command: "npm", args: ["run", "lint"] },
        { name: "build", command: "npm", args: ["run", "build"] },
      ],
    });
  });
  await stage("production-boot", boot);
  await stage(
    "generated-invoice-journey",
    async () => {
      await runCommand(
        "npm",
        ["exec", "playwright", "--", "install", "chromium"],
        {
          cwd: projectDir,
          logFile: path.join(reportDir, "browser-install.log"),
        },
      );
      await runCommand("npm", ["run", "test:journey"], {
        cwd: projectDir,
        env: { ...cleanEnvironment(), INVOICE_JOURNEY_LOG_DIR: reportDir },
        logFile: path.join(reportDir, "invoice-journey.log"),
      });
    },
    ["npm exec playwright -- install chromium", "npm run test:journey"],
  );
  if (!values.local && !values.ref)
    await stage("default-ref-stability", async () => {
      const current = await (
        await download(
          `https://api.github.com/repos/${values.template}/commits/HEAD`,
        )
      ).json();
      assert.equal(
        current.sha,
        metadata.sourceCommit,
        "Default ref moved during verification; rerun for evidence",
      );
    });
  metadata.status = "passed";
  console.log(`PASS (${metadata.mode}): ${reportFile}`);
} catch (error) {
  metadata.status = "failed";
  console.error(error);
  process.exitCode = 1;
} finally {
  if (server) stopProcess(server);
  if (!aborted) rmSync(temporary, { recursive: true, force: true });
  save();
}
