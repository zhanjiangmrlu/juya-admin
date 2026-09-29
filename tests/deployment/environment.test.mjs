import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { runBash } from './helpers.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const environmentScript = resolve(repositoryRoot, 'deploy/environment.sh')

test('maps the test branch only to the test deployment root', async () => {
  const result = await runBash(environmentScript, ['test', 'test'], {
    cwd: repositoryRoot
  })

  assert.equal(result.code, 0)
  assert.equal(result.stdout.trim(), '/opt/juya-admin/test')
  assert.equal(result.stderr, '')
})

test('maps the main branch only to the production deployment root', async () => {
  const result = await runBash(environmentScript, ['production', 'main'], {
    cwd: repositoryRoot
  })

  assert.equal(result.code, 0)
  assert.equal(result.stdout.trim(), '/opt/juya-admin/production')
  assert.equal(result.stderr, '')
})

for (const [environment, branch] of [
  ['test', 'main'],
  ['production', 'test'],
  ['staging', 'test']
]) {
  test(`rejects the ${environment}/${branch} deployment mapping`, async () => {
    const result = await runBash(environmentScript, [environment, branch], {
      cwd: repositoryRoot
    })

    assert.notEqual(result.code, 0)
    assert.equal(result.stdout, '')
  })
}

for (const args of [[], ['test']]) {
  test(`rejects a deployment mapping with ${args.length} argument(s)`, async () => {
    const result = await runBash(environmentScript, args, {
      cwd: repositoryRoot
    })

    assert.notEqual(result.code, 0)
    assert.equal(result.stdout, '')
  })
}
