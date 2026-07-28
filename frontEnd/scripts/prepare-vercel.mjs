import {
  cp,
  mkdir,
  readdir,
  access,
  copyFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(currentFile);
const rootDir = path.resolve(scriptsDir, "..");
const outputDir = path.join(rootDir, "dist");

const excludedNames = new Set([
  ".git",
  ".vscode",
  "dist",
  "node_modules",
  "src",
  "scripts",
  "pos-app",
  "lease-wizard.html",
  "package.json",
  "package-lock.json",
  "vite.config.ts",
  "vite.config.js",
  "eslint.config.js",
  "eslint.config.ts",
  "tsconfig.json",
  "tsconfig.app.json",
  "tsconfig.node.json",
]);

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyStaticFrontend() {
  const entries = await readdir(rootDir, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    if (
      excludedNames.has(entry.name) ||
      entry.name.startsWith(".env")
    ) {
      continue;
    }

    const source = path.join(rootDir, entry.name);
    const destination = path.join(outputDir, entry.name);

    await cp(source, destination, {
      recursive: true,
      force: true,
    });
  }
}

async function copyPosBuild() {
  const posBuildDir = path.join(
    rootDir,
    "pos-app",
    "dist",
  );

  if (!(await exists(posBuildDir))) {
    throw new Error(
      `POS build folder not found: ${posBuildDir}`,
    );
  }

  const posOutputDir = path.join(outputDir, "pos");

  await mkdir(posOutputDir, {
    recursive: true,
  });

  await cp(posBuildDir, posOutputDir, {
    recursive: true,
    force: true,
  });
}

async function ensureIndexPage() {
  const indexFile = path.join(outputDir, "index.html");

  if (await exists(indexFile)) {
    return;
  }

  const possibleEntryPages = [
    "signin.html",
    "login.html",
    "dashboard.html",
  ];

  for (const pageName of possibleEntryPages) {
    const source = path.join(outputDir, pageName);

    if (await exists(source)) {
      await copyFile(source, indexFile);

      console.log(
        `Created index.html from ${pageName}`,
      );

      return;
    }
  }

  throw new Error(
    "No index.html, signin.html, login.html or dashboard.html was found.",
  );
}

async function prepareDeployment() {
  await mkdir(outputDir, {
    recursive: true,
  });

  await copyStaticFrontend();
  await copyPosBuild();
  await ensureIndexPage();

  console.log("Vercel deployment folder prepared.");
}

prepareDeployment().catch((error) => {
  console.error(error);
  process.exit(1);
});