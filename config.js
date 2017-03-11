const deepExtend = require('deep-extend');
const path = require('path');
const noop = Function.prototype;

// All paths are relative to this container,
// even if defined within config file.
module.exports = function(config) {
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
      // TypeScript modules
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
      // TypeScript namespaces
      cats: {
        sources: [],
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
        // Let all packages through.
        test: (vendor) => true,
        watch: {
          // glob: '',
          init: noop,
          pre: noop,
          post: noop
        }
      },
      // bower vendors
      bower: {
        // Unlike npm, bower_components does not need to be next to bower.json
        components: '',
        manifest: '',
        bundle: '',
        watch: {
          glob: '',
          init: noop,
          pre: noop,
          post: noop
        }
      }
    },
    server: {
      node_modules: {
        from: '',
        to: '',
        watch: {
          glob: '',
          init: noop,
          pre: noop,
          post: noop
        }
      },
      ts: {
        from: '',
        to: '',
        tsconfig: '',
        watch: {
          glob: '',
          init: noop,
          pre: noop,
          post: noop
        }
      },
      watch: {
        init: noop
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
    // TODO: Make config file path configurable.
    customConfig = require(path.join(config.src, 'fullstack.config'))(config);
  } catch (e) {
    // TODO: This should exit with non-zero code.
    console.warn('Config file not found or invalid', e);
    customConfig = {};
  }

  return deepExtend({}, emptyConfig, customConfig);
};
