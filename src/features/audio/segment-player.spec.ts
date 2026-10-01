import { describe, expect, it, vi } from 'vitest'

import { createSegmentPlayer } from './segment-player'

describe('single segment audio player', () => {
  it('keeps the new segment active when an older play request rejects late', async () => {
    let rejectFirst!: (reason: Error) => void
    const audio = new EventTarget() as HTMLAudioElement
    audio.pause = vi.fn()
    audio.play = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectFirst = reject
          })
      )
      .mockResolvedValue(undefined)
    const player = createSegmentPlayer(audio)
    const first = player.play('old', '/one', 0, 1000).catch(() => undefined)
    await player.play('new', '/two', 0, 2000)
    rejectFirst(new Error('interrupted'))
    await first
    expect(player.activeId.value).toBe('new')
    player.dispose()
  })
  it('pauses the previous segment before switching and stops at the chosen end', async () => {
    const audio = new EventTarget() as HTMLAudioElement
    audio.currentTime = 0
    audio.src = ''
    audio.pause = vi.fn()
    audio.play = vi.fn().mockResolvedValue(undefined)
    const player = createSegmentPlayer(audio)
    await player.play('one', '/audio', 1000, 2000)
    await player.play('two', '/audio', 2500, 3000)
    expect(audio.currentTime).toBe(2.5)
    expect(player.activeId.value).toBe('two')
    audio.currentTime = 3.1
    audio.dispatchEvent(new Event('timeupdate'))
    expect(player.activeId.value).toBe(null)
    expect(audio.pause).toHaveBeenCalledTimes(3)
    player.dispose()
  })
  it('clears its segment monitor on pause and disposal', async () => {
    const audio = new EventTarget() as HTMLAudioElement
    audio.pause = vi.fn()
    audio.play = vi.fn().mockResolvedValue(undefined)
    const player = createSegmentPlayer(audio)
    await player.play('one', '/audio', 0, 1000)
    audio.dispatchEvent(new Event('pause'))
    expect(player.activeId.value).toBe(null)
    player.dispose()
    audio.dispatchEvent(new Event('timeupdate'))
    expect(audio.pause).toHaveBeenCalledTimes(2)
  })
})
