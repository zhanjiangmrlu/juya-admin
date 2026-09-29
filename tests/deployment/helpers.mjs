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
