import js from '@eslint/js';

const unusedRule = ['error', {
  argsIgnorePattern: '^_',
  caughtErrorsIgnorePattern: '^_',
  varsIgnorePattern: '^_',
}];

export default [
  {
    ignores: ['node_modules/**', 'release/**', 'coverage/**', 'assets/**'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'tests/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        document: 'readonly',
        window: 'readonly',
        localStorage: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        AudioContext: 'readonly',
        webkitAudioContext: 'readonly',
        Image: 'readonly',
        Element: 'readonly',
        HTMLElement: 'readonly',
        HTMLImageElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLSelectElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        HTMLProgressElement: 'readonly',
        URL: 'readonly',
        Response: 'readonly',
        fetch: 'readonly',
        structuredClone: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': unusedRule,
      'no-constant-condition': ['error', { checkLoops: false }],
    },
  },
  {
    files: ['src/**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: {
        __dirname: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        Response: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': unusedRule,
    },
  },
];
