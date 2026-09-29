import { describe, expect, it, vi } from 'vitest'

import { createXhrUploader } from './xhr-uploader'

describe('xhr uploader', () => {
  it('reports bounded progress and resolves on successful upload', async () => {
    const xhr = new FakeXhr()
    const onProgress = vi.fn()
    const promise = createXhrUploader(() => xhr as unknown as XMLHttpRequest).upload({
      fields: { key: 'uploads/a.png' },
      file: new File(['x'], 'a.png'),
      onProgress,
      signal: new AbortController().signal,
      url: 'https://oss.example.com'
    })
    xhr.progress?.({ lengthComputable: true, loaded: 2, total: 4 } as ProgressEvent)
    xhr.status = 204
    xhr.onload?.(new ProgressEvent('load'))
    await expect(promise).resolves.toBeUndefined()
    expect(onProgress).toHaveBeenCalledWith(50)
  })
})

class FakeXhr {
  onabort: ((event: ProgressEvent) => void) | null = null
  onerror: ((event: ProgressEvent) => void) | null = null
  onload: ((event: ProgressEvent) => void) | null = null
  status = 0
  upload = {
    set onprogress(handler: ((event: ProgressEvent) => void) | null) {
      fakeProgress = handler
    },
    get onprogress() {
      return fakeProgress
    }
  }

  get progress(): ((event: ProgressEvent) => void) | null {
    return fakeProgress
  }

  abort(): void {}
  open(): void {}
  send(): void {}
}

let fakeProgress: ((event: ProgressEvent) => void) | null = null
