#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['src/app', 'src/components', 'src/lib'];
const SEED_ROOTS = ['src/lib/demo-data', 'src/app/api/seed-data'];
const AI_ROOTS = ['src/app/api', 'src/lib'];

const CHINESE_RE = /[\u4e00-\u9fff]/g;
const CHINESE_AI_PROMPT_RE = /必须.*中文|用中文|中文回复|所有输出必须为中文|请用中文/g;
const EXT_RE = /\.(ts|tsx|js|jsx|mjs)$/;
const IGNORE_RE = /src\/lib\/demo-data\/english(?:\.test)?\.ts$/;

function walk(dir) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue;
      files.push(...walk(full));
    } else if (EXT_RE.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function countMatches(files, pattern) {
  const matches = [];
  for (const file of files) {
    if (IGNORE_RE.test(relative(process.cwd(), file))) continue;
    const text = readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);
    let count = 0;
    for (const line of lines) {
      pattern.lastIndex = 0;
      if (pattern.test(line)) count += 1;
    }
    if (count > 0) {
      matches.push({ file: relative(process.cwd(), file), lineHits: count });
    }
  }
  return matches.sort((a, b) => b.lineHits - a.lineHits || a.file.localeCompare(b.file));
}

function summarize(name, roots, pattern, limit = 25) {
  const files = roots.flatMap(walk);
  const matches = countMatches(files, pattern);
  const totalLineHits = matches.reduce((sum, item) => sum + item.lineHits, 0);
  return {
    name,
    scannedFiles: files.length,
    filesWithHits: matches.length,
    totalLineHits,
    topFiles: matches.slice(0, limit),
  };
}

const report = {
  generatedAt: new Date().toISOString(),
  scope: 'bilingual-readiness',
  checks: [
    summarize('customer-visible Chinese line hits in app/components/lib', ROOTS, CHINESE_RE),
    summarize('hardcoded Chinese-only AI prompt lines', AI_ROOTS, CHINESE_AI_PROMPT_RE),
    summarize('Chinese line hits in demo seed sources', SEED_ROOTS, CHINESE_RE),
  ],
};

console.log(JSON.stringify(report, null, 2));
