const deepExtend = require('deep-extend');
const path = require('path');
const noop = Function.prototype;

module.exports = function() {
  const emptyConfig = {
    client: {
      html: {
        entry: '',
        bundle: '',
        watch: '',
        watchCallback: noop,
        inject: {}
      },
      scss: {
        entry: '',
        bundle: '',
        watch: '',
        watchCallback: noop
      },
      ts: {
        entry: '',
        bundle: '',
        watch: '',
        watchCallback: noop,
        tsconfig: ''
      },
      vendors: {
        manifest: '',
        bundle: '',
        watchCallback: noop
      }
    },
    server: {
      from: '',
      to: '',
      tsconfig: '',
      watchCallback: noop
    },
    resources: {
      images: {
        from: '',
        to: '',
        manifest: '',
        watchCallback: noop
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
