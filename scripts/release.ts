/**
 * @fileoverview Release script for the yacqu/pdf-lib fork.
 *
 * Builds cjs + es artifacts, packs a tarball, creates a versioned GitHub
 * release on yacqu/pdf-lib, then updates the Seriph app's package.json to
 * point at the new release and runs `bun install`.
 *
 * Tag format:  v{version}-seriph-{N}  (e.g. v1.17.1-seriph-3)
 * The build number N is derived by reading the URL already in Seriph's
 * package.json and incrementing it.
 *
 * Usage:
 *   bun scripts/release.ts
 *   yarn release:seriph
 *
 * Optional env vars:
 *   SERIPH_DIR   — absolute path to the seriph-expo-52 directory
 *                  (defaults to ../../Expo/seriph-expo-52 relative to this repo)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const FORK_DIR = path.resolve(__dirname, '..');
const SERIPH_DIR = process.env.SERIPH_DIR
  ? path.resolve(process.env.SERIPH_DIR)
  : path.resolve(FORK_DIR, '../../Expo/seriph-expo-52');
const SERIPH_PKG_PATH = path.join(SERIPH_DIR, 'package.json');
const GH_REPO = 'yacqu/pdf-lib';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function run(cmd: string, cwd: string = FORK_DIR): void {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function readJson(filePath: string): Record<string, any> {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath: string, data: Record<string, any>): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

/** Parses the current seriph build number out of the Seriph package.json URL. */
function nextTag(forkVersion: string, seiphPkg: Record<string, any>): string {
  const currentUrl: string = seiphPkg.dependencies?.['pdf-lib'] ?? '';
  const match = currentUrl.match(/seriph(?:-(\d+))?/);
  const current = match ? (match[1] ? parseInt(match[1], 10) : 1) : 0;
  return `v${forkVersion}-seriph-${current + 1}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const forkPkg = readJson(path.join(FORK_DIR, 'package.json'));
  const seiphPkg = readJson(SERIPH_PKG_PATH);

  const tag = nextTag(forkPkg.version, seiphPkg);
  const tarballName = `pdf-lib-${forkPkg.version}.tgz`;
  const tarballPath = path.join(FORK_DIR, tarballName);

  console.log(`\nReleasing ${tag}...`);
  console.log(`Seriph dir: ${SERIPH_DIR}`);

  // 1. Build
  run('rm -rf cjs es');
  run('yarn build:cjs');
  run('yarn build:es');

  // 2. Pack
  run('npm pack');

  if (!fs.existsSync(tarballPath)) {
    throw new Error(`Expected tarball not found after npm pack: ${tarballPath}`);
  }

  // 3. Create GitHub release
  run(
    `GH_PAGER=cat gh release create ${tag}` +
      ` --repo ${GH_REPO}` +
      ` --title "Seriph ${tag}"` +
      ` --notes "Automated release. Build: tsc + tsc-alias."` +
      ` --target master` +
      ` ./${tarballName}`,
  );

  // 4. Update Seriph package.json
  const releaseUrl = `https://github.com/${GH_REPO}/releases/download/${tag}/${tarballName}`;
  seiphPkg.dependencies['pdf-lib'] = releaseUrl;
  writeJson(SERIPH_PKG_PATH, seiphPkg);
  console.log(`\nUpdated Seriph package.json → ${releaseUrl}`);

  // 5. Install in Seriph
  run('bun install', SERIPH_DIR);

  // 6. Clean up local tarball
  fs.unlinkSync(tarballPath);

  console.log(`\nDone — ${tag} released and installed in Seriph.`);
}

main();
