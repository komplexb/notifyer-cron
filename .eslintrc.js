module.exports = {
  parserOptions: {
    ecmaVersion: 2017
  },
  env: {
    node: true,
    es6: true
  },
  plugins: ['prettier', 'standard'],
  extends: ['prettier-standard'],
  rules: {
    // allow paren-less arrow functions
    'arrow-parens': 0,
    // allow async-await
    'generator-star-spacing': 0,
    camelcase: 0,
    'no-unused-vars': 1,
    'spaced-comment': 1,
    'no-mixed-spaces-and-tabs': 1,
    indent: 1,
    'brace-style': 1,
    'no-trailing-spaces': 1
  }
}
