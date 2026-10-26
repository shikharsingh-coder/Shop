// /**
//  * Task 1 - build this.
//  *
//  * Walk every .ts file under src/modules and look at its imports.
//  * A module may import:
//  *   - its own files
//  *   - anything under src/platform
//  *   - another module's index.ts  -  and nothing else
//  *
//  * Anything else is a violation.
//  *
//  * Running this file directly should print the violations and exit 1 when
//  * there are any, 0 when there are none.
//  *
//  * No dependencies. node:fs and node:path are enough. Remember that a
//  * type-only import still couples one module to another.
//  */
// export interface Violation {
//   file: string;
//   importPath: string;
//   reason: string;
// }

// export function findViolations(root: string): Violation[] {
//   //throw new Error("not implemented");
//   return [];
// }


import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";


export interface Violation {
  file: string;
  importPath: string;
  reason: string;
}

interface Token {
  kind: "identifier" | "string" | "punctuation";
  value: string;
  line: number;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;
  
  //skip whitespace, comments, and strings
  while (index < source.length) {
    const char = source[index]!;
    if (/\s/.test(char)) {
      if (char === "\n") line++;
      index++;
      continue;
    }

    // Skip comments
    if (char === "/" && source[index + 1] === "/") {
      index += 2;
      while (index < source.length && source[index] !== "\n") index++;
      continue;
    }
    
    // skip block comments
    if (char === "/" && source[index + 1] === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        if (source[index] === "\n") line++;
        index++;
      }
      index = Math.min(source.length, index + 2);
      continue;
    }

    // read strings
    if (char === "'" || char === '"') {
      const quote = char;
      let value = "";
      index++;
      while (index < source.length && source[index] !== quote) {
        if (source[index] === "\\") {
          const escaped = source[index + 1];
          if (escaped === undefined) break;
          value += escaped;
          index += 2;
        } else {
          if (source[index] === "\n") line++;
          value += source[index]!;
          index++;
        }
      }
      if (source[index] === quote) index++;
      tokens.push({ kind: "string", value, line });
      continue;
    }

    // Read identifiers
    if (/[A-Za-z_$]/.test(char)) {
      const start = index++;
      while (index < source.length && /[\w$]/.test(source[index]!)) index++;
      tokens.push({ kind: "identifier", value: source.slice(start, index), line });
      continue;
    }

    tokens.push({ kind: "punctuation", value: char, line });
    index++;
  }

  return tokens;
}

function getImportPaths(source: string): string[] {
  const tokens = tokenize(source);
  const imports: string[] = [];

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    if (token.kind !== "identifier" || (token.value !== "import" && token.value !== "export")) continue;

    const next = tokens[index + 1];
    if (token.value === "import" && next?.kind === "punctuation" && next.value === ".") continue;
    if (token.value === "import" && next?.kind === "string") {
      imports.push(next.value);
      continue;
    }
    if (
      token.value === "import" &&
      next?.kind === "punctuation" &&
      next.value === "(" &&
      tokens[index + 2]?.kind === "string"
    ) {
      imports.push(tokens[index + 2]!.value);
      continue;
    }

    for (let cursor = index + 1; cursor < tokens.length; cursor++) {
      const current = tokens[cursor]!;
      if (current.kind === "punctuation" && current.value === ";") break;
      if (
        current.kind === "identifier" &&
        (current.value === "import" || current.value === "export") &&
        current.line > token.line
      ) {
        break;
      }
      if (
        current.kind === "identifier" &&
        current.value === "from" &&
        tokens[cursor + 1]?.kind === "string"
      ) {
        imports.push(tokens[cursor + 1]!.value);
        break;
      }
    }
  }

  return imports;
}

function listTypeScriptFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTypeScriptFiles(entryPath));
    } else if (entry.isFile() && extname(entry.name) === ".ts") {
      files.push(entryPath);
    }
  }
  return files.sort();
}

function isWithin(directory: string, file: string): boolean {
  const relativePath = relative(directory, file);
  return relativePath === "" || (!isAbsolute(relativePath) && relativePath !== ".." && !relativePath.startsWith(`..${sep}`));
}

function isIndexImport(importer: string, importPath: string, otherModule: string): boolean {
  const target = resolve(dirname(importer), importPath);
  const extension = extname(target);
  const withoutExtension = extension ? target.slice(0, -extension.length) : target;
  const expectedIndex = resolve(otherModule, "index");
  return withoutExtension === expectedIndex;
}

export function findViolations(root: string): Violation[] {
  const sourceRoot = resolve(root);
  const modulesRoot = resolve(sourceRoot, "modules");
  const platformRoot = resolve(sourceRoot, "platform");
  const violations: Violation[] = [];

  for (const file of listTypeScriptFiles(modulesRoot)) {
    const modulePath = relative(modulesRoot, file).split(sep);
    if (modulePath.length < 2) continue;
    const moduleRoot = resolve(modulesRoot, modulePath[0]!);

    for (const importPath of getImportPaths(readFileSync(file, "utf8"))) {
      const target = resolve(dirname(file), importPath);
      if (isWithin(moduleRoot, target) || isWithin(platformRoot, target)) continue;

      const targetModule = relative(modulesRoot, target).split(sep)[0];
      const otherModule = targetModule ? resolve(modulesRoot, targetModule) : "";
      if (otherModule && otherModule !== moduleRoot && isIndexImport(file, importPath, otherModule)) {
        continue;
      }

      violations.push({
        file: relative(sourceRoot, file).split(sep).join("/"),
        importPath,
        reason: "modules may only import their own files, src/platform, or another module's index.ts",
      });
    }
  }

  return violations;
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const sourceRoot = resolve(dirname(scriptPath), "../src");
  const violations = findViolations(sourceRoot);
  for (const violation of violations) {
    console.error(`${violation.file} -> ${violation.importPath}: ${violation.reason}`);
  }
  process.exitCode = violations.length ? 1 : 0;
}

