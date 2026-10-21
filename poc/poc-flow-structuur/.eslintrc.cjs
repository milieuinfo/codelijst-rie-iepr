module.exports = {
  root: true,

  ignorePatterns: ['dist/**', 'node_modules/**', 'test-results/**'],

  overrides: [
    {
      files: ['src/**/*.ts', 'src/**/*.js'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
        ecmaVersion: 2022,
        tsconfigRootDir: __dirname,
      },
      plugins: ['@typescript-eslint', 'jsdoc', 'lit'],
      extends: [
        'plugin:@typescript-eslint/recommended',
        'plugin:jsdoc/recommended-typescript',
        'plugin:lit/recommended',
      ],
      settings: {
        jsdoc: {
          mode: 'typescript',
        },
      },
    },
  ],
}
