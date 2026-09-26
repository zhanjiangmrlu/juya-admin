import path from 'node:path'
import { fileURLToPath } from 'node:url'

import eslint from '@eslint/js'
import prettier from 'eslint-config-prettier'
import importPlugin from 'eslint-plugin-import'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import unicorn from 'eslint-plugin-unicorn'
import vue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

export default tseslint.config(
  {
    ignores: ['coverage/**', 'dist/**', 'node_modules/**']
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx,vue}'],
    languageOptions: {
      parserOptions: {
        extraFileExtensions: ['.vue'],
        parser: tseslint.parser,
        tsconfigRootDir: projectRoot
      }
    },
    plugins: {
      import: importPlugin,
      'simple-import-sort': simpleImportSort,
      unicorn
    },
    rules: {
      'import/no-duplicates': 'error',
      'import/no-unresolved': [
        'error',
        {
          caseSensitive: true,
          caseSensitiveStrict: true,
          commonjs: true
        }
      ],
      'simple-import-sort/exports': 'error',
      'simple-import-sort/imports': 'error'
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          noWarnOnMultipleProjects: true,
          project: ['./tsconfig.app.json', './tsconfig.node.json']
        }
      }
    }
  },
  {
    files: ['src/**/*.{ts,tsx,vue}'],
    rules: {
      'unicorn/filename-case': [
        'error',
        {
          cases: {
            kebabCase: true
          },
          ignore: ['^App\\.vue$', '^env\\.d\\.ts$']
        }
      ]
    }
  },
  {
    rules: {
      'vue/multi-word-component-names': 'off'
    }
  },
  prettier
)
