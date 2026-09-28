import { readonly, ref, shallowRef } from 'vue'

import { createIdempotencyKey } from '@/services/api/api-client'

import type { DeepReadonly, Ref } from 'vue'

export type CommandState = 'error' | 'idle' | 'submitting' | 'success'
export type CommandExecutor<TInput, TResult> = (
  input: TInput,
  idempotencyKey: string
) => Promise<TResult>

export interface IdempotentCommandController<TInput, TResult> {
  error: Readonly<Ref<unknown>>
  idempotencyKey: Readonly<Ref<string>>
  input: DeepReadonly<Ref<TInput | null>>
  reset(input?: TInput): void
  result: DeepReadonly<Ref<TResult | null>>
  retry(): Promise<TResult>
  state: Readonly<Ref<CommandState>>
  submit(input: TInput): Promise<TResult>
}

/**
 * 创建在同一逻辑操作内复用幂等键的命令控制器。
 *
 * @param execute - 接收业务输入和幂等键的异步命令执行器。
 * @returns 可提交、重试和重置的幂等命令控制器。
 */
export function useIdempotentCommand<TInput, TResult>(
  execute: CommandExecutor<TInput, TResult>
): IdempotentCommandController<TInput, TResult> {
  const idempotencyKey = ref(createIdempotencyKey())
  const input = shallowRef<TInput | null>(null)
  const result = shallowRef<TResult | null>(null)
  const error = shallowRef<unknown>(null)
  const state = ref<CommandState>('idle')
  let inputFingerprint: string | null = null

  /**
   * 使用当前输入和当前幂等键执行一次命令。
   *
   * @returns 命令返回的业务结果。
   */
  async function executeCurrent(): Promise<TResult> {
    if (input.value === null) throw new Error('没有可重试的命令')
    state.value = 'submitting'
    error.value = null
    try {
      const nextResult = await execute(input.value, idempotencyKey.value)
      result.value = nextResult
      state.value = 'success'
      return nextResult
    } catch (reason) {
      error.value = reason
      state.value = 'error'
      throw reason
    }
  }

  /**
   * 为新的业务输入生成幂等键并清理上一次执行状态。
   *
   * @param nextInput - 可选的新业务输入。
   * @returns 无返回值。
   */
  function reset(nextInput?: TInput): void {
    idempotencyKey.value = createIdempotencyKey()
    input.value = nextInput ?? null
    inputFingerprint = nextInput === undefined ? null : fingerprintInput(nextInput)
    result.value = null
    error.value = null
    state.value = 'idle'
  }

  /**
   * 提交业务输入，输入实质变化时自动开启新的幂等操作。
   *
   * @param nextInput - 本次命令的完整业务输入。
   * @returns 命令返回的业务结果。
   */
  async function submit(nextInput: TInput): Promise<TResult> {
    const nextFingerprint = fingerprintInput(nextInput)
    if (inputFingerprint !== null && inputFingerprint !== nextFingerprint) reset(nextInput)
    else {
      input.value = nextInput
      inputFingerprint = nextFingerprint
    }
    return executeCurrent()
  }

  /**
   * 以原输入和原幂等键重试最近一次逻辑操作。
   *
   * @returns 命令返回的业务结果。
   */
  async function retry(): Promise<TResult> {
    return executeCurrent()
  }

  return {
    error: readonly(error),
    idempotencyKey: readonly(idempotencyKey),
    input: readonly(input),
    reset,
    result: readonly(result),
    retry,
    state: readonly(state),
    submit
  }
}

/**
 * 将业务输入转换为稳定的结构指纹用于识别表单实质变化。
 *
 * @param input - 需要比较的业务输入。
 * @returns 可比较的 JSON 字符串。
 */
function fingerprintInput<TInput>(input: TInput): string {
  return JSON.stringify(input, objectKeySorter)
}

/**
 * 在 JSON 序列化期间按键名排序普通对象。
 *
 * @param _key - 当前字段名，排序逻辑无需使用。
 * @param value - 当前字段值。
 * @returns 键名已排序的普通对象或原值。
 */
function objectKeySorter(_key: string, value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right)
    )
  )
}
