#!/usr/bin/env node
// Remove placeholder product photos from the Cloudflare release artifact.
// Keep source files for UI-development tests; never modify the repository.
import { existsSync, rmSync, lstatSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve('dist');
const exampleImages = path.join(root, 'images');
if (existsSync(exampleImages)) {
  const stat = lstatSync(exampleImages);
  if (!stat.isDirectory() && !stat.isSymbolicLink()) {
    throw new Error('Unexpected dist/images entry; refusing release cleanup');
  }
  rmSync(exampleImages, { recursive: true, force: true });
  console.log('[catalog] Demo image assets removed from dist/');
}
