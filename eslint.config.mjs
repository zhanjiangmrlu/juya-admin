import path from 'node:path'
import { fileURLToPath } from 'node:url'

import eslint from '@eslint/js'
import prettier from 'eslint-config-prettier'
import importPlugin from 'eslint-plugin-import'
import jsdoc from 'eslint-plugin-jsdoc'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import unicorn from 'eslint-plugin-unicorn'
import unusedImports from 'eslint-plugin-unused-imports'
import vue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))
const importGroups = [['^node:'], ['^@?\\w'], ['^@/'], ['^.+\\u0000$'], ['^\\.'], ['^\\u0000']]

export default tseslint.config(
  {
    ignores: ['.superpowers/**', 'coverage/**', 'dist/**', 'node_modules/**']
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
      jsdoc,
      'simple-import-sort': simpleImportSort,
      unicorn,
      'unused-imports': unusedImports
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'import/no-duplicates': 'error',
      'import/no-unresolved': [
        'error',
        {
          caseSensitive: true,
          caseSensitiveStrict: true,
          commonjs: true
        }
      ],
      'jsdoc/check-param-names': 'error',
      'jsdoc/check-tag-names': 'error',
      'jsdoc/require-description': 'error',
      'jsdoc/require-jsdoc': [
        'error',
        {
          contexts: [
            'FunctionDeclaration',
            'MethodDefinition',
            'VariableDeclarator[init.type="ArrowFunctionExpression"]',
            'VariableDeclarator[init.type="FunctionExpression"]'
          ],
          enableFixer: false
        }
      ],
      'jsdoc/require-param': 'error',
      'jsdoc/require-param-description': 'error',
      'jsdoc/require-param-type': 'off',
      'jsdoc/require-returns': 'error',
      'jsdoc/require-returns-description': 'error',
      'jsdoc/require-returns-type': 'off',
      'simple-import-sort/exports': 'error',
      'simple-import-sort/imports': [
        'error',
        {
          groups: importGroups
        }
      ],
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          vars: 'all',
          varsIgnorePattern: '^_'
        }
      ]
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
    files: ['**/*.{spec,test}.{js,mjs,cjs,ts,tsx}', '**/__tests__/**/*.{js,mjs,cjs,ts,tsx}'],
    rules: {
      'jsdoc/require-jsdoc': 'off'
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
