import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import { compareResultDirs } from "./compare-runs.mjs"

const writeRuns = (root, scenario, runs) => runs.forEach((data, index) => {
  const directory = join(root, `${scenario}-${index + 1}`)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, "idle-summary.json"), JSON.stringify(data))
})

const idle = (busy, extra = {}) => ({ metrics: { mainThreadBusyPercent: busy }, frameLiveness: { framesPerSecond: 60 }, ...extra })
const row = (table, label) => table.split("\n").find((line) => line.startsWith(`| ${label} |`))

test("verdicts: inside the before range is noise, outside is better or worse", () => {
  const root = mkdtempSync(join(tmpdir(), "compare-runs-"))
  try {
    writeRuns(join(root, "before"), "idle", [idle(1.0), idle(1.2), idle(1.4)])
    writeRuns(join(root, "noise"), "idle", [idle(1.1), idle(1.3), idle(1.3)])
    writeRuns(join(root, "faster"), "idle", [idle(0.5), idle(0.6), idle(0.7)])
    writeRuns(join(root, "slower"), "idle", [idle(2.0), idle(2.1), idle(2.2)])
    assert.match(row(compareResultDirs(join(root, "before"), join(root, "noise")), "main-thread busy %"), /\| noise \|$/)
    assert.match(row(compareResultDirs(join(root, "before"), join(root, "faster")), "main-thread busy %"), /\| better \|$/)
    assert.match(row(compareResultDirs(join(root, "before"), join(root, "slower")), "main-thread busy %"), /\| WORSE \|$/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("a throttled run is excluded and named, not averaged in", () => {
  const root = mkdtempSync(join(tmpdir(), "compare-runs-"))
  try {
    writeRuns(join(root, "before"), "idle", [idle(1.0), idle(1.0)])
    writeRuns(join(root, "after"), "idle", [idle(1.0), idle(0, { frameLiveness: { framesPerSecond: 1 } })])
    const table = compareResultDirs(join(root, "before"), join(root, "after"))
    assert.match(row(table, "main-thread busy %"), /\| 1 \/ 1 \(1\) \|/)
    assert.match(table, /after: excluded 1 of 2 runs: idle-2 \(renderer throttled\)/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
