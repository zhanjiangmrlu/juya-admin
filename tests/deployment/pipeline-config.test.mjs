import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const pipelineConfigPath = resolve(repositoryRoot, '.aliyun-ci.yml')

async function readPipelineConfig() {
  return readFile(pipelineConfigPath, 'utf8')
}

test('builds only the test branch with the pinned Node and pnpm versions', async () => {
  const config = await readPipelineConfig()

  assert.match(config, /group:\s*public\/cn-hangzhou/)
  assert.match(config, /container:\s*node:22\.22\.0-bookworm-slim/)
  assert.match(config, /test\s+"\$\{CI_COMMIT_REF_NAME\}"\s+=\s+"test"/)
  assert.match(config, /corepack prepare pnpm@11\.22\.0 --activate/)
})

test('runs the complete quality gate before publishing the artifact', async () => {
  const config = await readPipelineConfig()
  const branchGuard = config.indexOf('test "${CI_COMMIT_REF_NAME}" = "test"')
  const install = config.indexOf('pnpm install --frozen-lockfile')
  const check = config.indexOf('pnpm check')
  const unitTest = config.indexOf('pnpm test')
  const build = config.indexOf('pnpm build')
  const upload = config.indexOf('step: ArtifactUpload')

  assert.ok(branchGuard >= 0)
  assert.ok(branchGuard < install)
  assert.ok(install < check)
  assert.ok(check < unitTest)
  assert.ok(unitTest < build)
  assert.ok(build < upload)
})

test('publishes the test frontend and deployment scripts as one artifact', async () => {
  const config = await readPipelineConfig()

  assert.match(config, /artifact:\s*juya_admin_test_web/)
  assert.match(config, /filePath:\s*\n\s*-\s*dist\//)
  assert.match(config, /filePath:[\s\S]*?\n\s*-\s*deploy\//)
})

test('deploys only to the configured test machine group', async () => {
  const config = await readPipelineConfig()

  assert.match(config, /component:\s*VMDeploy/)
  assert.match(config, /machineGroup:\s*\$\{ECS_TEST_MACHINE_GROUP_ID\}/)
  assert.match(config, /artifactDownloadPath:\s*\/tmp\/juya-admin-test\.tgz/)
  assert.match(config, /executeUser:\s*root/)
  assert.match(
    config,
    /ecs-deploy\.sh"\s+test\s+test\s+"\$\{BUILD_NUMBER\}-\$\{CI_COMMIT_SHA\}"\s+"\$staging"/
  )

  assert.doesNotMatch(config, /ECS_PRODUCTION_MACHINE_GROUP_ID/)
  assert.doesNotMatch(config, /PRODUCTION_APPROVER_ID/)
})
