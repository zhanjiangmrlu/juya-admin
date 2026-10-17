import { expect, it } from 'vitest'

it('stops polling a slow worker without discarding the accepted media id', async () => {
  const { waitForMedia } = await import('@/services/media-processing')
  const initial = { id: 'accepted-image', state: 'processing' }
  let calls = 0
  const result = await waitForMedia(
    initial,
    async () => {
      calls++
      return initial
    },
    { pause: async () => {}, active: () => true, checks: 3 }
  )
  expect(calls).toBe(3)
  expect(result).toEqual(initial)
})
it('does not read or apply results after its page has been unloaded', async () => {
  const { waitForMedia } = await import('@/services/media-processing')
  let active = true,
    calls = 0
  const result = await waitForMedia(
    { id: 'accepted-image', state: 'processing' },
    async () => {
      calls++
      return { id: 'accepted-image', state: 'ready' }
    },
    {
      pause: async () => {
        active = false
      },
      active: () => active
    }
  )
  expect(calls).toBe(0)
  expect(result.state).toBe('processing')
})
