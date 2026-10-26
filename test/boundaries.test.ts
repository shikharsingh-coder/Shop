import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findViolations } from "../tools/check-boundaries.ts";

const ROOT = fileURLToPath(new URL("../src", import.meta.url));

function withFixture(files: Record<string, string>, run: (sourceRoot: string) => void): void {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "boundary-check-"));
  try {
    for (const [path, contents] of Object.entries(files)) {
      const file = join(fixtureRoot, "src", path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, contents);
    }
    run(join(fixtureRoot, "src"));
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

test("all application modules obey their import boundaries", () => {
  const violations = findViolations(ROOT);
  assert.deepEqual(
    violations,
    [],
    "boundary violations:\n" +
      violations.map(({ file, importPath }) => `  ${file} -> ${importPath}`).join("\n"),
  );
});

test("allows own files, platform imports, and another module's index", () => {
  withFixture(
    {
      "modules/orders/service.ts": [
        'import "./helper.ts";',
        'import "../../platform/api.ts";',
        'import "../inventory/index.ts";',
      ].join("\n"),
      "modules/orders/helper.ts": "",
      "modules/inventory/index.ts": "",
      "platform/api.ts": "",
    },
    (sourceRoot) => assert.deepEqual(findViolations(sourceRoot), []),
  );
});

test("reports deep and type-only cross-module imports, but ignores comments and strings", () => {
  withFixture(
    {
      "modules/orders/service.ts": [
        '// import "../inventory/comment-only.ts";',
        'const note = "import \'../inventory/string-only.ts\'";',
        'import "../inventory/service.ts";',
        'import type { Internal } from "../inventory/repo.ts";',
      ].join("\n"),
      "modules/inventory/index.ts": "",
      "modules/inventory/service.ts": "",
      "modules/inventory/repo.ts": "",
    },
    (sourceRoot) => {
      const violations = findViolations(sourceRoot);
      assert.deepEqual(
        violations.map(({ importPath }) => importPath),
        ["../inventory/service.ts", "../inventory/repo.ts"],
      );
    },
  );
});
