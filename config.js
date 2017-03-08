const deepExtend = require('deep-extend');
const path = require('path');
const noop = Function.prototype;

module.exports = function() {
  const emptyConfig = {
    client: {
      html: {
        entry: '',
        bundle: '',
        watch: {
          glob: '',
          init: noop,
          pre: noop,
          post: noop
        },
        inject: {}
      },
      scss: {
        entry: '',
        bundle: '',
        watch: {
          glob: '',
          init: noop,
          pre: noop,
          post: noop
        }
      },
      ts: {
        entry: '',
        bundle: '',
        watch: {
          glob: '',
          init: noop,
          pre: noop,
          post: noop
        },
        tsconfig: ''
      },
      vendors: {
        manifest: '',
        bundle: '',
        watch: {
          // glob: '',
          init: noop,
          pre: noop,
          post: noop
        }
      }
    },
    server: {
      from: '',
      to: '',
      tsconfig: '',
      watch: {
        // glob: '',
        init: noop,
        pre: noop,
        post: noop
      }
    },
    resources: {
      images: {
        from: '',
        to: '',
        manifest: '',
        watch: {
          // glob: '',
          init: noop,
          pre: noop,
          post: noop
        },
      }
    },
    services: {},
    gitCommit: ''
  };

  let customConfig;
  try {
    customConfig = require(path.join(config.src, 'fullstack.conf'))(config);
  } catch (e) {
    console.warn('Config file not found or invalid', e);
    customConfig = {};
  }

  return deepExtend({}, emptyConfig, customConfig);
};
