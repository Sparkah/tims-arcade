import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function listDirs(relativePath) {
  const absolutePath = path.join(root, relativePath);

  if (!fs.existsSync(absolutePath)) {
    return [];
  }

  return fs
    .readdirSync(absolutePath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function listFiles(relativePath, extension) {
  const absolutePath = path.join(root, relativePath);

  if (!fs.existsSync(absolutePath)) {
    return [];
  }

  return fs
    .readdirSync(absolutePath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && (!extension || entry.name.endsWith(extension)))
    .map((entry) => entry.name)
    .sort();
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

const packageJson = readJson('package.json');
const manifest = exists('.ai/skill-manifest.json') ? readJson('.ai/skill-manifest.json') : undefined;
const skills = listDirs('skills').filter((name) => !name.startsWith('_'));
const scenes = listFiles('src/game/scenes', '.ts');
const templates = listFiles('templates/modules', '.ts');
const recipes = listFiles('docs/feature-recipes', '.md').filter((name) => name !== 'README.md');
const blueprints = listFiles('docs/genre-blueprints', '.md').filter((name) => name !== 'README.md');

const report = [
  '# Agent Audit',
  '',
  'Project: ' + (packageJson.name ?? 'unknown'),
  'Engine: Phaser',
  'Primary target: ' + (manifest?.primaryTarget ?? 'mobile'),
  'Yandex Games: ' + (manifest?.yandexGames ? 'enabled' : 'disabled'),
  'Playwright smoke tests: ' + (packageJson.scripts?.['test:smoke'] ? 'enabled' : 'not enabled'),
  '',
  '## Required Startup',
  '- AGENTS.md: ' + (exists('AGENTS.md') ? 'present' : 'missing'),
  '- AGENT_WORKFLOW.md: ' + (exists('AGENT_WORKFLOW.md') ? 'present' : 'missing'),
  '- skills/_meta/task-map.md: ' + (exists('skills/_meta/task-map.md') ? 'present' : 'missing'),
  '- docs/first-playable-contract.md: ' + (exists('docs/first-playable-contract.md') ? 'present' : 'missing'),
  '- docs/validation-matrix.md: ' + (exists('docs/validation-matrix.md') ? 'present' : 'missing'),
  '- docs/quality-gates.md: ' + (exists('docs/quality-gates.md') ? 'present' : 'missing'),
  '',
  '## Current Structure',
  '- Skills: ' + skills.length + (skills.length ? ' (' + skills.join(', ') + ')' : ''),
  '- Scenes: ' + scenes.length + (scenes.length ? ' (' + scenes.join(', ') + ')' : ''),
  '- Module templates: ' + templates.length + (templates.length ? ' (' + templates.join(', ') + ')' : ''),
  '- Feature recipes: ' + recipes.length + (recipes.length ? ' (' + recipes.join(', ') + ')' : ''),
  '- Genre blueprints: ' + blueprints.length + (blueprints.length ? ' (' + blueprints.join(', ') + ')' : ''),
  '',
  '## Available Commands',
  ...Object.keys(packageJson.scripts ?? {}).sort().map((script) => '- npm run ' + script),
  '',
  '## Agent Reminder',
  '1. Follow AGENT_WORKFLOW.md.',
  '2. Pick skills from skills/_meta/task-map.md.',
  '3. Use templates/modules only as starting points.',
  '4. Validate with docs/validation-matrix.md and docs/quality-gates.md.',
].join('\n');

console.log(report);
