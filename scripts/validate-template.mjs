import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);

/** Load the actual installed npm release schema, never the CLI's prompt fallback. */
export function publishedManifestSchema() {
  const cliPath = require.resolve("create-scaffold-hbar");
  const source = readFileSync(cliPath, "utf8");
  const start = source.indexOf("const EnvVarSchema =");
  const end = source.indexOf("const TEMPLATE_VALUE_ALIASES =", start);
  assert(
    start >= 0 && end > start,
    "Published CLI schema layout changed; update adapter before validating",
  );
  const cliRequire = createRequire(cliPath);
  const { z } = cliRequire("zod");
  return vm.runInNewContext(
    source.slice(start, end) + "\nTemplateManifestSchema;",
    { z },
    { timeout: 1000 },
  );
}

/** @param {unknown} raw */
export function validateManifest(raw) {
  const manifest = publishedManifestSchema().parse(raw);
  const block = manifest["create-scaffold-hbar"];
  for (const [key, value] of Object.entries({
    frontend: "nextjs-app",
    solidityFramework: "hardhat",
    packageManager: "npm",
  })) {
    assert.deepEqual(
      block?.capabilities?.[key],
      [value],
      `capabilities.${key} must declare only ${value}`,
    );
    assert.equal(
      block?.defaults?.[key],
      value,
      `defaults.${key} must be ${value}`,
    );
  }
  assert.equal(
    block?.requirements?.node,
    "24.10.0",
    "Node requirement must match tested pin",
  );
  return manifest;
}

/** @param {string} root */
export function validateSource(root) {
  validateManifest(
    JSON.parse(readFileSync(path.join(root, "template.json"), "utf8")),
  );
  for (const file of [
    "README.md",
    "AGENTS.md",
    "LICENSE",
    "package-lock.json",
    ".nvmrc",
    ".npmrc",
  ]) {
    assert(
      readFileSync(path.join(root, file), "utf8").trim(),
      `${file} must be nonempty`,
    );
  }
  assert(
    readFileSync(path.join(root, "LICENSE"), "utf8").includes("MIT License"),
    "MIT license required",
  );
  assert.equal(
    readFileSync(path.join(root, ".nvmrc"), "utf8").trim(),
    "24.10.0",
  );
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  assert.deepEqual(pkg.workspaces, ["packages/hardhat", "packages/nextjs"]);
  assert.equal(pkg.engines.node, "24.10.0");
  assert.equal(pkg.packageManager, "npm@11.6.1");
  auditPackaging(root);
  for (const workspace of [".", ...pkg.workspaces]) {
    const ws = JSON.parse(
      readFileSync(path.join(root, workspace, "package.json"), "utf8"),
    );
    for (const deps of [ws.dependencies, ws.devDependencies]) {
      for (const [name, version] of Object.entries(deps || {})) {
        assert(
          /^\d+\.\d+\.\d+([+-].*)?$/.test(String(version)),
          `Unpinned ${name}`,
        );
      }
    }
  }
}

/** Reject copied artifacts, runtime configuration, symlinks and private key files.
 * @param {string} root */
export function auditPackaging(root) {
  const walk = (/** @type {string} */ dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const filename = path.join(dir, entry.name);
      assert(
        !["node_modules", ".next", "artifacts", "cache"].includes(entry.name),
        `Author artifact included: ${filename}`,
      );
      assert(
        !(
          entry.name === ".env" ||
          (entry.name.startsWith(".env.") && entry.name !== ".env.example")
        ),
        `Runtime dotenv forbidden: ${filename}`,
      );
      assert(
        !entry.isSymbolicLink(),
        `Template symlink forbidden: ${filename}`,
      );
      if (entry.isDirectory()) walk(filename);
      else {
        const content = readFileSync(filename, "utf8");
        assert(
          !/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content),
          `Private key in ${filename}`,
        );
      }
    }
  };
  walk(root);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = path.resolve(process.argv[2] || ".");
  // Working checkouts can contain private .env/dependencies; source auditing uses exported commits in verify:template.
  validateManifest(
    JSON.parse(readFileSync(path.join(root, "template.json"), "utf8")),
  );
  console.log(
    "PASS: manifest matches the published CLI schema and the single supported combination",
  );
}
