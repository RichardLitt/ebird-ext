import neostandard from 'neostandard'

export default [
  ...neostandard({
    ignores: [
      'node_modules/**',
      'coverage/**',
      // Claude Code agent worktrees
      '.claude/**',
      // One-off data scripts: untested, not maintained to this standard
      'shimeBirdData/**',
      'scripts/**'
    ]
  }),
  {
    // Import attributes (`with { type: 'json' }`) need the latest syntax
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' }
  }
]
