import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const nginxConfigPath = resolve(repositoryRoot, 'deploy/nginx/juya-admin-test.conf')

async function readNginxConfig() {
  return readFile(nginxConfigPath, 'utf8')
}

test('serves the test release through the default port 80 site', async () => {
  const config = await readNginxConfig()

  assert.match(config, /listen\s+80\s+default_server;/)
  assert.match(config, /server_name\s+_;/)
  assert.match(config, /root\s+\/opt\/juya-admin\/test\/current;/)
  assert.match(config, /try_files\s+\$uri\s+\$uri\/\s+\/index\.html;/)
})

test('returns 503 for API requests instead of the frontend document', async () => {
  const config = await readNginxConfig()

  assert.match(config, /location\s+\^~\s+\/api\/\s*\{[^}]*return\s+503\b/s)
})

test('uses safe cache policies for the entry document and hashed assets', async () => {
  const config = await readNginxConfig()

  assert.match(config, /location\s+=\s+\/index\.html\s*\{[^}]*Cache-Control\s+"no-store"/s)
  assert.match(
    config,
    /location\s+\^~\s+\/assets\/\s*\{[^}]*Cache-Control\s+"public, max-age=31536000, immutable"/s
  )
})

test('adds baseline browser headers and denies hidden files', async () => {
  const config = await readNginxConfig()

  assert.match(config, /add_header\s+X-Content-Type-Options\s+"nosniff"\s+always;/)
  assert.match(config, /add_header\s+X-Frame-Options\s+"SAMEORIGIN"\s+always;/)
  assert.match(config, /add_header\s+Referrer-Policy\s+"no-referrer"\s+always;/)
  assert.match(config, /location\s+~\s+\/\\\.\s*\{[^}]*deny\s+all;/s)
})
