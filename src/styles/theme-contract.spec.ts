import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('management theme contract', () => {
  it('defines the core admin color and layout tokens', async () => {
    const tokens = await readFile(resolve(process.cwd(), 'src/styles/tokens.scss'), 'utf8')

    expect(tokens).toContain('--juya-sidebar-width: 222px')
    expect(tokens).toContain('--juya-color-primary: #326b44')
    expect(tokens).toContain('--juya-panel-radius: 18px')
  })
})
