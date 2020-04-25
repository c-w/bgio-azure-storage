module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './**/tsconfig.json',
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:jest/recommended',
  ],
  env: {
    node: true,
    es6: true,
  },
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'off',
  },
};
