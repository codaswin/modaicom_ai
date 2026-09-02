#!/usr/bin/env node
// Package the built extension into a ready-to-load ZIP for GitHub Releases.
//
// Output: release/modaicom-v<version>.zip whose ROOT contains manifest.json, so a
// user can download it, unzip it, and point chrome://extensions "Load unpacked"
// at the extracted folder — no Node, npm, or local build required.
//
// Expects `npm run build` to have produced dist/ already. `npm run package`
// chains the build and this script together.
//
// Requires the `zip` CLI (preinstalled on GitHub's ubuntu runners and most
// Linux/macOS setups).

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const distDir = join(root, 'dist')
const outDir = join(root, 'release')
const manifestPath = join(distDir, 'manifest.json')

function fail(message) {
  console.error(`package: ${message}`)
  process.exit(1)
}

if (!existsSync(manifestPath)) {
  fail('dist/manifest.json not found — run `npm run build` first.')
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

if (manifest.version !== pkg.version) {
  fail(
    `version mismatch — package.json is ${pkg.version}, dist/manifest.json is ${manifest.version}.`,
  )
}

const zipName = `modaicom-v${pkg.version}.zip`
const zipPath = join(outDir, zipName)

mkdirSync(outDir, { recursive: true })
rmSync(zipPath, { force: true })

// cwd = dist so paths are stored relative to dist/ — manifest.json lands at the
// archive root rather than under a dist/ prefix.
execFileSync('zip', ['-r', '-X', '-9', zipPath, '.'], {
  cwd: distDir,
  stdio: 'inherit',
})

// Fail loudly if manifest.json is not at the archive root.
const listing = execFileSync('zip', ['-sf', zipPath], { encoding: 'utf8' })
if (!/^\s*manifest\.json\s*$/m.test(listing)) {
  console.error(listing)
  fail('manifest.json is not at the ZIP root.')
}

const sizeKb = (statSync(zipPath).size / 1024).toFixed(1)
console.log(`\npackage: wrote release/${zipName} (${sizeKb} KB)`)
