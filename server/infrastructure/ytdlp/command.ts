import { spawn, type ChildProcess } from 'node:child_process'

export interface CommandResult {
  stdout: string
  stderr: string
  code: number
}

export interface RunCommandOptions {
  onStderr?: (chunk: string) => void
  onStdout?: (chunk: string) => void
  signal?: AbortSignal
}

const activeProcesses = new Map<string, ChildProcess>()

export function registerProcess(jobId: string, proc: ChildProcess): void {
  activeProcesses.set(jobId, proc)
}

export function killProcess(jobId: string): boolean {
  const proc = activeProcesses.get(jobId)
  if (!proc) return false
  proc.kill('SIGTERM')
  activeProcesses.delete(jobId)
  return true
}

export function runCommand(
  command: string,
  args: string[],
  jobId?: string,
  options?: RunCommandOptions
): Promise<CommandResult> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (result: CommandResult) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    const proc = spawn(command, args, {
      shell: false,
      windowsHide: true,
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    })
    if (jobId) registerProcess(jobId, proc)

    let stdout = ''
    let stderr = ''

    proc.stdout?.on('data', (d: Buffer) => {
      const chunk = d.toString()
      stdout += chunk
      options?.onStdout?.(chunk)
    })
    proc.stderr?.on('data', (d: Buffer) => {
      const chunk = d.toString()
      stderr += chunk
      options?.onStderr?.(chunk)
    })

    if (options?.signal) {
      options.signal.addEventListener('abort', () => {
        proc.kill('SIGTERM')
      }, { once: true })
    }

    proc.on('error', (err) => {
      if (jobId) activeProcesses.delete(jobId)
      finish({ stdout, stderr: err.message, code: 1 })
    })

    proc.on('close', (code) => {
      if (jobId) activeProcesses.delete(jobId)
      finish({ stdout, stderr, code: code ?? 1 })
    })
  })
}

export async function checkBinary(path: string): Promise<{ available: boolean, version?: string }> {
  const result = await runCommand(path, ['--version'])
  if (result.code !== 0) return { available: false }
  const version = (result.stdout || result.stderr).split('\n')[0]?.trim()
  return { available: true, version }
}

export function parseProgress(stderr: string): number | null {
  const match = stderr.match(/(\d+(?:\.\d+)?)%/)
  return match ? parseFloat(match[1]) : null
}
