import neostandard from 'neostandard'

export default [
  ...neostandard({
    ignores: [
      'node_modules/**',
      'coverage/**',
      // One-off data scripts: untested, not maintained to this standard
      'montpelier.js',
      'shimeBirdData/**',
      'scripts/**'
    ]
  }),
  {
    // Import attributes (`with { type: 'json' }`) need the latest syntax
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' }
  }
]
