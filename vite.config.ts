import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const base = repoName && !repoName.endsWith('.github.io') ? `/${repoName}/` : '/'

export default defineConfig({
  base,
  plugins: [solid()],
})
