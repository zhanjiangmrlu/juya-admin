export default {
  extends: ['stylelint-config-standard-scss', 'stylelint-config-recommended-vue/scss'],
  ignoreFiles: ['coverage/**', 'dist/**', 'node_modules/**'],
  rules: {
    'declaration-no-important': true,
    'max-nesting-depth': 3,
    'selector-class-pattern': '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$',
    'selector-max-id': 0,
    'selector-max-specificity': '0,3,0'
  }
}
