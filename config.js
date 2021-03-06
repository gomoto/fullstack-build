const deepExtend = require('deep-extend');
const path = require('path');
const noop = Function.prototype;

// All paths are relative to this container,
// even if defined within config file.
module.exports = function(config) {
  const emptyConfig = {
    // List of copy configuration objects. Each object should have src and dest.
    // The format of src and dest follows gulp.src and gulp.dest rules.
    copy: [],
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
        extensions: ['gif', 'jpg', 'png', 'svg'],
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
    git: {
      directory: '',
      commit: ''
    }
  };

  let customConfig;
  try {
    customConfig = require(config.file)();
  } catch (e) {
    console.error('Config file not found or invalid');
    throw new Error(e);
  }

  return deepExtend({}, emptyConfig, customConfig);
};
