import { describe, expect, it, vi } from 'vitest'

import { createSegmentPlayer } from './segment-player'

describe('single segment audio player', () => {
  it('seeks after metadata loads and ignores late playing events from a paused element', async () => {
    const audio = new EventTarget() as HTMLAudioElement
    Object.defineProperty(audio, 'readyState', { writable: true, value: 0 })
    Object.defineProperty(audio, 'paused', { writable: true, value: true })
    audio.currentTime = 0
    audio.pause = vi.fn()
    audio.play = vi.fn().mockResolvedValue(undefined)
    const player = createSegmentPlayer(audio)
    await player.play('part', '/audio', 500, 1000)
    expect(audio.currentTime).toBe(0)
    Object.defineProperty(audio, 'readyState', { writable: true, value: 1 })
    audio.dispatchEvent(new Event('loadedmetadata'))
    expect(audio.currentTime).toBe(0.5)
    const secondAudio = new EventTarget() as HTMLAudioElement
    secondAudio.pause = vi.fn()
    secondAudio.play = vi.fn().mockResolvedValue(undefined)
    const second = createSegmentPlayer(secondAudio)
    await second.play('new', '/new')
    audio.dispatchEvent(new Event('playing'))
    expect(second.activeId.value).toBe('new')
    player.dispose()
    second.dispose()
  })
  it('stops another mounted player before starting its own audio', async () => {
    const firstAudio = new EventTarget() as HTMLAudioElement
    firstAudio.pause = vi.fn()
    firstAudio.play = vi.fn().mockResolvedValue(undefined)
    const secondAudio = new EventTarget() as HTMLAudioElement
    secondAudio.pause = vi.fn()
    secondAudio.play = vi.fn().mockResolvedValue(undefined)
    const first = createSegmentPlayer(firstAudio)
    const second = createSegmentPlayer(secondAudio)
    await first.play('a', '/a')
    await second.play('b', '/b')
    expect(first.activeId.value).toBeNull()
    expect(second.activeId.value).toBe('b')
    first.dispose()
    second.dispose()
  })
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
  it('retains the current segment on pause and clears it on disposal', async () => {
    const audio = new EventTarget() as HTMLAudioElement
    audio.pause = vi.fn()
    audio.play = vi.fn().mockResolvedValue(undefined)
    const player = createSegmentPlayer(audio)
    await player.play('one', '/audio', 0, 1000)
    audio.dispatchEvent(new Event('pause'))
    expect(player.activeId.value).toBe('one')
    expect(player.status.value).toBe('paused')
    player.dispose()
    audio.dispatchEvent(new Event('timeupdate'))
    expect(audio.pause).toHaveBeenCalledTimes(2)
  })

  it('loads a bound source immediately, toggles pause/resume without seeking, and exposes failures', async () => {
    const audio = new EventTarget() as HTMLAudioElement
    audio.currentTime = 0
    audio.pause = vi.fn()
    audio.load = vi.fn()
    audio.play = vi.fn().mockResolvedValue(undefined)
    const player = createSegmentPlayer(audio)
    player.load('/bound')
    expect(audio.src).toBe('/bound')
    expect(audio.load).toHaveBeenCalledOnce()
    await player.play('s1', '/bound', 100, 2000)
    expect(player.status.value).toBe('playing')
    audio.currentTime = 0.7
    await player.play('s1', '/bound', 100, 2000)
    expect(player.status.value).toBe('paused')
    await player.play('s1', '/bound', 100, 2000)
    expect(audio.currentTime).toBe(0.7)
    audio.dispatchEvent(new Event('waiting'))
    expect(player.status.value).toBe('loading')
    audio.dispatchEvent(new Event('playing'))
    expect(player.status.value).toBe('playing')
    audio.dispatchEvent(new Event('error'))
    expect(player.status.value).toBe('error')
    await player.play('s1', '/bound', 100, 2000)
    expect(player.status.value).toBe('playing')
    audio.dispatchEvent(new Event('ended'))
    expect(player.status.value).toBe('ended')
    player.dispose()
  })
})
