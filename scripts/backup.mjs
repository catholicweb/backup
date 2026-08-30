#!/usr/bin/env node
// Backup the live parroquia.app site configs into config/<slug>/config.json.
//
// Fetches the slug list, then each site's config, normalizes the JSON (stable
// key ordering + 2-space indent), writes it to disk, and reports which files
// were added/changed/unchanged. Runs daily from .github/workflows/backup.yml.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = "https://data.parroquia.app";
const SLUGS_URL = `${BASE_URL}/slugs.json`;
const OUT_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "config",
);

// Recursively sort object keys so the on-disk representation is stable
// regardless of the order the source returns keys in. This keeps git diffs
// minimal and readable.
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sortKeys(value[k])]),
    );
  }
  return value;
}

async function getJson(url, { fatal }) {
  const res = await fetch(url);
  if (!res.ok) {
    const msg = `GET ${url} -> HTTP ${res.status} ${res.statusText}`;
    if (fatal) throw new Error(msg);
    console.warn(`  warn: ${msg}`);
    return null;
  }
  try {
    return await res.json();
  } catch {
    const msg = `GET ${url} -> invalid JSON body`;
    if (fatal) throw new Error(msg);
    console.warn(`  warn: ${msg}`);
    return null;
  }
}

async function backup() {
  const slugsData = await getJson(SLUGS_URL, { fatal: true });
  const slugs = slugsData?.slugs;
  if (!Array.isArray(slugs) || slugs.length === 0) {
    throw new Error(`Expected { slugs: [...] } from ${SLUGS_URL}, got none`);
  }

  const counts = { added: 0, changed: 0, unchanged: 0, failed: 0 };

  for (const slug of slugs) {
    const config = await getJson(`${BASE_URL}/${slug}/config.json`, {
      fatal: false,
    });
    if (config === null) {
      counts.failed += 1;
      continue;
    }

    const normalized =
      `${JSON.stringify(sortKeys(config), null, 2)}\n`;
    const filePath = path.join(OUT_DIR, slug, "config.json");
    await mkdir(path.dirname(filePath), { recursive: true });

    let previous = null;
    try {
      previous = await readFile(filePath, "utf8");
    } catch {
      // File doesn't exist yet — it's a new backup.
    }

    await writeFile(filePath, normalized);

    if (previous === null) {
      console.log(`  added   ${slug}`);
      counts.added += 1;
    } else if (previous !== normalized) {
      console.log(`  changed ${slug}`);
      counts.changed += 1;
    } else {
      counts.unchanged += 1;
    }
  }

  // Backup auth.enc
  const authUrl = `${BASE_URL}/auth.enc`;
  const authPath = path.join(OUT_DIR, "auth.enc");
  try {
    const authRes = await fetch(authUrl);
    if (authRes.ok) {
      const authText = await authRes.text();
      let authPrev = null;
      try {
        authPrev = await readFile(authPath, "utf8");
      } catch {
        // not present
      }
      await writeFile(authPath, authText);
      if (authPrev === null) {
        console.log("  added   auth.enc");
      } else if (authPrev !== authText) {
        console.log("  changed auth.enc");
      } else {
        console.log("  unchanged auth.enc");
      }
    } else {
      console.warn(`  warn: GET ${authUrl} -> HTTP ${authRes.status}`);
    }
  } catch (err) {
    console.warn(`  warn: auth.enc fetch failed: ${err.message}`);
  }

  console.log(
    `\nDone: ${counts.added} added, ${counts.changed} changed, ` +
      `${counts.unchanged} unchanged${counts.failed ? `, ${counts.failed} failed` : ""}.`,
  );
}

backup().catch((err) => {
  console.error(`backup failed: ${err.message}`);
  process.exit(1);
});
