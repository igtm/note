import solid from 'vite-plugin-solid'
import { defineConfig } from 'vitest/config'

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const base = repoName && !repoName.endsWith('.github.io') ? `/${repoName}/` : '/'

export default defineConfig({
  base,
  plugins: [solid()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
