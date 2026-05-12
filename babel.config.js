export default {
  presets: [['@babel/preset-env']],
  env: {
    test: {
      presets: [['@babel/preset-env', { modules: 'commonjs' }]],
    },
  },
};
