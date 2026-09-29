import assert from 'node:assert/strict'
import { chmod, cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { env as processEnvironment } from 'node:process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { prependBashPath, runBash, toBashPath } from './helpers.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const deployScript = resolve(repositoryRoot, 'deploy/ecs-deploy.sh')
const nginxSource = resolve(repositoryRoot, 'deploy/nginx/juya-admin-test.conf')

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'juya-admin-deploy-'))
  const bundle = join(root, 'bundle')
  const fakeBin = join(root, 'bin')
  const nginxLog = join(root, 'nginx.log')
  await mkdir(join(bundle, 'dist/assets'), { recursive: true })
  await mkdir(join(bundle, 'deploy/nginx'), { recursive: true })
  await mkdir(fakeBin, { recursive: true })
  await writeFile(join(bundle, 'dist/index.html'), '<title>release</title>', 'utf8')
  await writeFile(join(bundle, 'dist/assets/app.js'), 'export {}', 'utf8')
  await cp(nginxSource, join(bundle, 'deploy/nginx/juya-admin-test.conf'))

  const nginx = join(fakeBin, 'nginx')
  const curl = join(fakeBin, 'curl')
  await writeFile(
    nginx,
    '#!/bin/sh\nprintf "%s\\n" "$*" >> "$NGINX_LOG"\nexit "${NGINX_EXIT:-0}"\n',
    'utf8'
  )
  await writeFile(curl, '#!/bin/sh\nexit "${CURL_EXIT:-0}"\n', 'utf8')
  await chmod(nginx, 0o755)
  await chmod(curl, 0o755)

  return {
    bundle,
    env: {
      ...processEnvironment,
      JUYA_DEPLOY_TEST_MODE: '1',
      JUYA_DEPLOY_TEST_ROOT: toBashPath(root),
      JUYA_CURL_BIN: toBashPath(curl),
      JUYA_NGINX_BIN: toBashPath(nginx),
      NGINX_LOG: toBashPath(nginxLog),
      PATH: prependBashPath(fakeBin)
    },
    nginxLog,
    releaseRoot: join(root, 'opt/juya-admin/test'),
    root
  }
}

async function runDeploy(fixture, releaseId, overrides = {}) {
  return runBash(deployScript, ['test', 'test', releaseId, toBashPath(fixture.bundle)], {
    cwd: repositoryRoot,
    env: { ...fixture.env, ...overrides }
  })
}

async function withFixture(run) {
  const fixture = await createFixture()
  try {
    await run(fixture)
  } finally {
    await rm(fixture.root, { force: true, recursive: true })
  }
}

async function assertCurrentRelease(fixture, releaseId, expectedHtml) {
  const expectedRelease = toBashPath(join(fixture.releaseRoot, 'releases', releaseId))
  assert.equal(
    (await readFile(join(fixture.releaseRoot, 'current'), 'utf8')).trim(),
    expectedRelease
  )
  assert.equal(
    await readFile(join(fixture.releaseRoot, 'releases', releaseId, 'index.html'), 'utf8'),
    expectedHtml
  )
}

test('publishes a valid test bundle and switches the current release', async () => {
  await withFixture(async (fixture) => {
    const result = await runDeploy(fixture, '12-abc123')

    assert.equal(result.code, 0, result.stderr)
    await assertCurrentRelease(fixture, '12-abc123', '<title>release</title>')
    assert.equal(
      await readFile(join(fixture.root, 'etc/nginx/conf.d/juya-admin-test.conf'), 'utf8'),
      await readFile(nginxSource, 'utf8')
    )
    assert.deepEqual((await readFile(fixture.nginxLog, 'utf8')).trim().split('\n'), [
      '-t',
      '-s reload'
    ])
  })
})

for (const releaseId of ['.', '..', 'feature/test', 'release id', 'release;id']) {
  test(`rejects unsafe release id ${JSON.stringify(releaseId)}`, async () => {
    await withFixture(async (fixture) => {
      const result = await runDeploy(fixture, releaseId)

      assert.notEqual(result.code, 0)
      assert.match(result.stderr, /invalid release id/)
      await assert.rejects(readFile(join(fixture.releaseRoot, 'current'), 'utf8'))
    })
  })
}

test('rejects a bundle without index.html before switching releases', async () => {
  await withFixture(async (fixture) => {
    await rm(join(fixture.bundle, 'dist/index.html'))

    const result = await runDeploy(fixture, 'missing-index')

    assert.notEqual(result.code, 0)
    assert.match(result.stderr, /bundle is missing dist\/index\.html/)
    await assert.rejects(readFile(join(fixture.releaseRoot, 'current'), 'utf8'))
  })
})

test('rejects a bundle without assets before switching releases', async () => {
  await withFixture(async (fixture) => {
    await rm(join(fixture.bundle, 'dist/assets'), { recursive: true })

    const result = await runDeploy(fixture, 'missing-assets')

    assert.notEqual(result.code, 0)
    assert.match(result.stderr, /bundle is missing dist\/assets/)
    await assert.rejects(readFile(join(fixture.releaseRoot, 'current'), 'utf8'))
  })
})

test('rejects the wrong branch without creating a release', async () => {
  await withFixture(async (fixture) => {
    const result = await runBash(
      deployScript,
      ['test', 'main', 'wrong-branch', toBashPath(fixture.bundle)],
      { cwd: repositoryRoot, env: fixture.env }
    )

    assert.notEqual(result.code, 0)
    assert.match(result.stderr, /invalid deployment mapping/)
    await assert.rejects(readdir(join(fixture.releaseRoot, 'releases')))
  })
})

test('rejects production deployment while production is intentionally unconfigured', async () => {
  await withFixture(async (fixture) => {
    const result = await runBash(
      deployScript,
      ['production', 'main', 'production-disabled', toBashPath(fixture.bundle)],
      { cwd: repositoryRoot, env: fixture.env }
    )

    assert.notEqual(result.code, 0)
    assert.match(result.stderr, /production deployment is not configured/)
    await assert.rejects(readdir(join(fixture.root, 'opt/juya-admin/production/releases')))
  })
})

test('rejects a test root override outside explicit test mode', async () => {
  await withFixture(async (fixture) => {
    const env = { ...fixture.env }
    delete env.JUYA_DEPLOY_TEST_MODE

    const result = await runBash(
      deployScript,
      ['test', 'test', 'unsafe-override', toBashPath(fixture.bundle)],
      { cwd: repositoryRoot, env }
    )

    assert.notEqual(result.code, 0)
    assert.match(result.stderr, /test root override requires JUYA_DEPLOY_TEST_MODE=1/)
    await assert.rejects(readdir(join(fixture.releaseRoot, 'releases')))
  })
})

test('restores the previous release when the new health check fails', async () => {
  await withFixture(async (fixture) => {
    assert.equal((await runDeploy(fixture, 'release-a')).code, 0)
    await writeFile(join(fixture.bundle, 'dist/index.html'), '<title>release b</title>', 'utf8')

    const result = await runDeploy(fixture, 'release-b', { CURL_EXIT: '22' })

    assert.notEqual(result.code, 0)
    await assertCurrentRelease(fixture, 'release-a', '<title>release</title>')
    const nginxEvents = (await readFile(fixture.nginxLog, 'utf8')).trim().split('\n')
    assert.equal(nginxEvents.filter((event) => event === '-s reload').length, 3)
    assert.deepEqual(nginxEvents.slice(-2), ['-t', '-s reload'])
  })
})

test('removes current when the first release health check fails', async () => {
  await withFixture(async (fixture) => {
    const result = await runDeploy(fixture, 'first-failure', { CURL_EXIT: '22' })

    assert.notEqual(result.code, 0)
    await assert.rejects(readFile(join(fixture.releaseRoot, 'current'), 'utf8'))
    assert.deepEqual((await readFile(fixture.nginxLog, 'utf8')).trim().split('\n'), [
      '-t',
      '-s reload',
      '-t',
      '-s reload'
    ])
  })
})

test('keeps only the current and previous successful releases', async () => {
  await withFixture(async (fixture) => {
    assert.equal((await runDeploy(fixture, 'release-a')).code, 0)
    assert.equal((await runDeploy(fixture, 'release-b')).code, 0)
    assert.equal((await runDeploy(fixture, 'release-c')).code, 0)

    assert.deepEqual((await readdir(join(fixture.releaseRoot, 'releases'))).sort(), [
      'release-b',
      'release-c'
    ])
  })
})
