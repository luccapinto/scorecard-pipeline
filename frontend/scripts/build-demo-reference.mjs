#!/usr/bin/env node
// Generates src/demo/reference.generated.ts from the repository's real
// synthetic job/competency profiles in data/synthetic/.
//
// Why generate instead of hand-copying: the demo's whole claim is that it is
// fed by the project's own fixtures — the same job descriptions and the same
// BARS anchors the scoring prompt uses. Hand-copied JSON drifts the first time
// someone edits a competency. Generated output is committed so the frontend
// build never reaches outside frontend/.
//
// Run: npm run build:demo-reference

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SYNTHETIC = resolve(here, '../../data/synthetic');
const OUT = resolve(here, '../src/demo/reference.generated.ts');

const jobIds = readdirSync(SYNTHETIC)
  .filter((name) => name.startsWith('job_') && name.endsWith('.json'))
  .map((name) => name.slice('job_'.length, -'.json'.length))
  .sort();

if (jobIds.length === 0) {
  console.error(`No job_*.json found in ${SYNTHETIC}`);
  process.exit(1);
}

const jobs = jobIds.map((jobId) => {
  const job = JSON.parse(readFileSync(join(SYNTHETIC, `job_${jobId}.json`), 'utf8'));
  const competencyFile = join(SYNTHETIC, `competency_${jobId}.json`);
  const competencies = JSON.parse(readFileSync(competencyFile, 'utf8')).competencies ?? [];

  return {
    jobId,
    title: job.title ?? jobId,
    description: job.description ?? '',
    requirements: job.requirements ?? [],
    competencies: competencies.map((competency) => ({
      name: competency.name,
      description: competency.description ?? '',
      levels: Object.entries(competency.bars_levels ?? {})
        .map(([score, text]) => ({ score: Number(score), text }))
        .sort((a, b) => a.score - b.score),
    })),
  };
});

const banner = `// GENERATED FILE — do not edit by hand.
//
// Source: data/synthetic/job_*.json and data/synthetic/competency_*.json
// Regenerate: npm run build:demo-reference
//
// These are the repository's own synthetic job profiles and BARS competency
// frameworks — the same fixtures the scoring prompt is built from. The demo
// dataset is derived from them so the demonstration shows the real evaluation
// rubric, not an invented one.
`;

const body = `
export interface DemoBarsLevel {
  score: number;
  text: string;
}

export interface DemoCompetency {
  name: string;
  description: string;
  levels: DemoBarsLevel[];
}

export interface DemoJobProfile {
  jobId: string;
  title: string;
  description: string;
  requirements: string[];
  competencies: DemoCompetency[];
}

export const DEMO_JOB_PROFILES: DemoJobProfile[] = ${JSON.stringify(jobs, null, 2)};
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${banner}${body}`, 'utf8');

const competencyCount = jobs.reduce((sum, job) => sum + job.competencies.length, 0);
console.log(
  `Wrote ${OUT}\n  ${jobs.length} jobs, ${competencyCount} competencies ` +
    `(${jobs.map((job) => job.jobId).join(', ')})`,
);
