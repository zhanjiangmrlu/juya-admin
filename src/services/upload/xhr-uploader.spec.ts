import { describe, expect, it, vi } from 'vitest'

import { createXhrUploader } from './xhr-uploader'

describe('xhr uploader', () => {
  it('uses the actual file MIME for the OSS policy form field', async () => {
    const xhr = new FakeXhr()
    const send = vi.spyOn(xhr, 'send')
    const promise = createXhrUploader(() => xhr as unknown as XMLHttpRequest).upload({
      fields: { 'Content-Type': 'image/jpeg', 'x-oss-signature-version': 'OSS4-HMAC-SHA256' },
      file: new File(['x'], 'a.png', { type: 'image/png' }),
      onProgress: vi.fn(),
      signal: new AbortController().signal,
      url: 'https://oss.test'
    })
    const form = send.mock.calls[0]?.[0] as unknown as FormData
    expect(form.get('Content-Type')).toBe('image/png')
    expect(form.get('x-oss-signature-version')).toBe('OSS4-HMAC-SHA256')
    expect([...form.keys()].at(-1)).toBe('file')
    xhr.status = 200
    xhr.onload?.(new ProgressEvent('load'))
    await promise
  })
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
  send(_body?: FormData): void {}
}

let fakeProgress: ((event: ProgressEvent) => void) | null = null
