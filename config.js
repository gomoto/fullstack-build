const deepExtend = require('deep-extend');
const path = require('path');

module.exports = function() {
  const emptyConfig = {
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

  let customConfig;
  try {
    customConfig = require(path.join(process.cwd(), 'fullstack.conf'))();
  } catch (e) {
    console.warn('No config file found');
    customConfig = {};
  }

  return deepExtend({}, emptyConfig, customConfig);
};
