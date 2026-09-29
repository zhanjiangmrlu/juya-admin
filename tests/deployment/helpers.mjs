import { spawn } from 'node:child_process'
import { env as processEnvironment, platform } from 'node:process'

const windowsBash = 'C:/Program Files/Git/bin/bash.exe'

/**
 * Run a repository shell script and capture its observable process result.
 *
 * @param {string} scriptPath absolute or working-directory-relative script path
 * @param {string[]} args script arguments
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} options process options
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>} captured exit code and output
 */
export function runBash(scriptPath, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const executable = platform === 'win32' ? windowsBash : 'bash'
    const child = spawn(executable, [scriptPath, ...args], {
      cwd: options.cwd,
      env: options.env ?? processEnvironment,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.once('error', reject)
    child.once('close', (code) => {
      resolve({ code: code ?? -1, stdout, stderr })
    })
  })
}

/**
 * Convert an absolute host path to the form understood by Git Bash.
 *
 * @param {string} path host filesystem path
 * @returns {string} Bash-compatible path
 */
export function toBashPath(path) {
  if (platform !== 'win32') return path

  return path
    .replace(/^([A-Za-z]):[\\/]/, (_, drive) => `/${drive.toLowerCase()}/`)
    .replaceAll('\\', '/')
}

/**
 * Build a PATH value that keeps host tools visible inside Git Bash.
 *
 * @param {string} firstPath directory to prepend
 * @returns {string} Bash-compatible PATH value
 */
export function prependBashPath(firstPath) {
  const separator = platform === 'win32' ? ';' : ':'
  const inheritedPaths = (processEnvironment.PATH ?? '')
    .split(separator)
    .filter(Boolean)
    .map(toBashPath)

  return [toBashPath(firstPath), ...inheritedPaths].join(':')
}
