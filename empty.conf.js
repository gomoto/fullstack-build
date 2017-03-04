module.exports = function() {
  return {
    client: {
      html: {
        entry: '',
        bundle: '',
        watch: '',
        inject: {}
      },
      scss: {
        entry: '',
        bundle: '',
        watch: ''
      },
      ts: {
        entry: '',
        bundle: '',
        watch: '',
        tsconfig: ''
      },
      vendors: {
        manifest: '',
        bundle: ''
      }
    },
    server: {
      from: '',
      to: '',
      tsconfig: ''
    },
    resources: {
      images: {
        from: '',
        to: '',
        manifest: ''
      }
    },
    gitCommit: ''
  };
};
