#!/usr/bin/env node
// Local check for the GitHub Actions workflows in .github/workflows.
//
// GitHub only validates a workflow file after it has been pushed, so this catches the cheap
// mistakes before that: YAML that does not parse (indentation, a stray quote, duplicate keys),
// the basic shape GitHub expects (`on`, `jobs`, `runs-on`, `steps`, one of `uses`/`run` per step),
// cron expressions with the wrong number of fields, unpinned actions, `steps.<id>` references
// to ids that do not exist, `${{ }}` expressions inlined into `run:` scripts (GitHub's injection
// guidance says to pass them through `env:` instead), and the shell syntax of every bash `run:`
// script via `bash -n` when bash is on the PATH (Git Bash on Windows).
//
// It does not know the full workflow schema or whether an action's inputs exist; the first manual
// run on GitHub remains the real test for that.
//
// Usage: npm run lint:workflows   (exit code 1 on any finding)

import { spawnSync } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parseDocument } from 'yaml'

const WORKFLOWS_DIR = path.resolve('.github/workflows')
const ACTION_REF = /^(\.\/|[\w.-]+\/[\w.-]+(\/[\w./-]+)?@(v\d+(\.\d+){0,2}|[0-9a-f]{40})$)/
const EXPRESSION = /\$\{\{[^}]*\}\}/g
const BASH_SHELLS = new Set([undefined, 'bash', 'sh'])

const findings = []
const report = (file, where, message) => findings.push(`${file}${where ? ` (${where})` : ''}: ${message}`)

const bashAvailable = spawnSync('bash', ['--version'], { encoding: 'utf8' }).status === 0
const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'workflow-check-'))
let runStepsChecked = 0

try {
  const files = (await readdir(WORKFLOWS_DIR)).filter((name) => /\.ya?ml$/.test(name)).sort()
  if (files.length === 0) {
    console.error(`no workflow files found in ${WORKFLOWS_DIR}`)
    process.exit(1)
  }

  for (const file of files) {
    const text = await readFile(path.join(WORKFLOWS_DIR, file), 'utf8')
    const doc = parseDocument(text, { uniqueKeys: true, prettyErrors: true })
    for (const error of doc.errors) report(file, '', error.message.trim())
    for (const warning of doc.warnings) report(file, '', `warning: ${warning.message.trim()}`)
    if (doc.errors.length > 0) continue
    await checkWorkflow(file, doc.toJS())
  }

  if (!bashAvailable) console.log('note: bash not found on PATH, run: scripts were not syntax-checked')
  if (findings.length > 0) {
    console.error(`${findings.length} finding(s):`)
    for (const finding of findings) console.error(`  - ${finding}`)
    process.exit(1)
  }
  console.log(`OK: ${await countFiles()} workflow file(s) parsed, ${runStepsChecked} run step(s) ${bashAvailable ? 'syntax-checked with bash -n' : 'found'}`)
} finally {
  await rm(tmpDir, { recursive: true, force: true })
}

async function countFiles() {
  return (await readdir(WORKFLOWS_DIR)).filter((name) => /\.ya?ml$/.test(name)).length
}

async function checkWorkflow(file, workflow) {
  if (!isObject(workflow)) return report(file, '', 'top level is not a mapping')

  // `on` is a plain string key under YAML 1.2, which both GitHub and this parser use.
  if (!('on' in workflow)) report(file, '', 'missing `on`')
  const on = workflow.on
  if (isObject(on) && on.schedule !== undefined) {
    if (!Array.isArray(on.schedule)) report(file, 'on.schedule', 'must be a list')
    else {
      on.schedule.forEach((entry, i) => {
        const where = `on.schedule[${i}]`
        if (!isObject(entry) || typeof entry.cron !== 'string') return report(file, where, 'needs a `cron` string')
        const fields = entry.cron.trim().split(/\s+/)
        if (fields.length !== 5) report(file, where, `cron "${entry.cron}" has ${fields.length} fields, expected 5`)
        if (entry.timezone !== undefined && typeof entry.timezone !== 'string') report(file, where, '`timezone` must be a string')
      })
    }
  }

  if (!isObject(workflow.jobs) || Object.keys(workflow.jobs).length === 0) return report(file, '', 'missing or empty `jobs`')

  for (const [jobId, job] of Object.entries(workflow.jobs)) {
    const where = `jobs.${jobId}`
    if (!isObject(job)) {
      report(file, where, 'job is not a mapping')
      continue
    }
    if (job['runs-on'] === undefined && job.uses === undefined) report(file, where, 'missing `runs-on`')
    if (job.uses !== undefined) continue // reusable workflow call, no steps
    if (!Array.isArray(job.steps) || job.steps.length === 0) {
      report(file, where, 'missing or empty `steps`')
      continue
    }
    const jobShell = job.defaults?.run?.shell
    const ids = new Set()
    const referenced = []

    for (const [index, step] of job.steps.entries()) {
      const stepWhere = `${where}.steps[${index}]${typeof step?.name === 'string' ? ` "${step.name}"` : ''}`
      if (!isObject(step)) {
        report(file, stepWhere, 'step is not a mapping')
        continue
      }
      const hasUses = step.uses !== undefined
      const hasRun = step.run !== undefined
      if (hasUses === hasRun) report(file, stepWhere, 'a step needs exactly one of `uses` or `run`')
      if (hasUses && (typeof step.uses !== 'string' || !ACTION_REF.test(step.uses))) {
        report(file, stepWhere, `\`uses: ${step.uses}\` is not pinned like owner/repo@vN or owner/repo@<40-char sha>`)
      }
      if (step.id !== undefined) {
        if (ids.has(step.id)) report(file, stepWhere, `duplicate step id "${step.id}"`)
        ids.add(step.id)
      }
      if (step.if !== undefined && typeof step.if !== 'string' && typeof step.if !== 'boolean') report(file, stepWhere, '`if` must be a string')
      for (const text of [step.if, ...Object.values(step.env ?? {}), ...Object.values(step.with ?? {})]) {
        if (typeof text === 'string') for (const match of text.matchAll(/steps\.([\w-]+)\./g)) referenced.push({ id: match[1], stepWhere })
      }
      if (hasRun) {
        if (typeof step.run !== 'string') {
          report(file, stepWhere, '`run` must be a string')
          continue
        }
        if (EXPRESSION.test(step.run)) {
          report(file, stepWhere, 'run script inlines a `${{ }}` expression; pass it through `env:` and read it as a shell variable')
        }
        EXPRESSION.lastIndex = 0
        const shell = step.shell ?? jobShell
        if (!BASH_SHELLS.has(shell)) continue // pwsh, python, ...: not ours to check
        runStepsChecked += 1
        if (bashAvailable) await bashSyntaxCheck(file, stepWhere, step.run.replace(EXPRESSION, '__EXPR__'))
      }
    }

    for (const { id, stepWhere } of referenced) {
      if (!ids.has(id)) report(file, stepWhere, `refers to steps.${id} but no step has id "${id}"`)
    }
  }
}

async function bashSyntaxCheck(file, where, script) {
  const scriptPath = path.join(tmpDir, `${runStepsChecked}.sh`)
  await writeFile(scriptPath, script, 'utf8')
  const result = spawnSync('bash', ['-n', scriptPath], { encoding: 'utf8' })
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || 'bash -n failed').trim().replace(scriptPath, '<run script>')
    report(file, where, `bash syntax: ${message}`)
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
