// Project directory is one level below this file.
const assert = require('assert');
const path = require('path');
assert.equal(path.dirname(process.cwd()), __dirname);

// Module require() is relative to current working directory.
// Local require(./[...]) is relative to __dirname and cannot be used to access
// project files.
const addSrc = require('gulp-add-src');
const async = require('async');
const autoprefixer = require('gulp-autoprefixer');
const browserSync = require('browser-sync');
const browserify = require('browserify-incremental');
const buffer = require('vinyl-buffer');
const chalk = require('chalk');
const child_process = require('child_process');
const dotenv = require('dotenv');
const envify = require('envify/custom');
const fs = require('fs');
const fsExtra = require('fs-extra');
const glob = require('glob');
const gulp = require('gulp');
const htmlInjector = require('html-injector');
const htmlMinifierStream = require('html-minifier-stream');
const imagemin = require('gulp-imagemin');
const jsonfile = require('jsonfile');
const mergeStream = require('merge-stream');
const rename = require('gulp-rename');
const rev = require('gulp-rev');
const revReplace = require('gulp-rev-replace');
const rimraf = require('rimraf');
const sass = require('gulp-sass');
const source = require('vinyl-source-stream');
const sourcemaps = require('gulp-sourcemaps');
const tcp = require('tcp-port-used');
const tsify = require('tsify');
const typescript = require('gulp-typescript');
const uglify = require('gulp-uglify');

const noop = Function.prototype;

/**
 * file.css -> file-*.css?(.map)
 * file.js -> file-*.js?(.map)
 */
function hashGlob(filepath) {
  const dirname = path.dirname(filepath);
  const extname = path.extname(filepath);
  const basename = path.basename(filepath, extname);
  return path.join(dirname, `${basename}-*${extname}`) + '?(.map)';
}

/**
 * Delete file. Then delete ancestor directories that are empty.
 */
function cleanPath(filepath, done) {
  done = done || noop;
  // If you need to go to parent of working directory to get to filepath,
  // then filepath is not inside working directory.
  if (path.relative(process.cwd(), filepath).slice(0,2) === '..') {
    throw new Error('filepath must live inside working directory');
  }
  fs.unlink(filepath, () => {
    // Remove empty directories until working directory is reached.
    removeEmptyDirectory(path.dirname(filepath), process.cwd());
    done();
  });
}

/**
 * Remove directory. Then delete ancestor directories that are empty.
 */
function removeDirectory(directory, done) {
  done = done || noop;
  // If you need to go to parent of working directory to get to directory,
  // then directory is not inside working directory.
  if (path.relative(process.cwd(), directory).slice(0,2) === '..') {
    throw new Error('directory must live inside working directory');
  }
  rimraf(directory, () => {
    // Remove empty directories until working directory is reached.
    removeEmptyDirectory(path.dirname(directory), process.cwd());
    done();
  });
}

/**
 * Delete multiple files.
 */
function cleanPaths(filepaths, done) {
  done = done || noop;
  const tasks = filepaths.map((filepath) => {
    return (then) => {
      cleanPath(filepath, then);
    }
  });
  async.parallel(tasks, done);
}

/**
 * Remove empty directories until non-empty or root directory is reached.
 */
function removeEmptyDirectory(current, root) {
  // Don't remove root directory.
  if (path.relative(current, root) === '') {
    return;
  }
  // Directory does not exist.
  if (!fs.existsSync(current)) {
    return;
  }
  const contents = fs.readdirSync(current);
  // Directory has contents.
  if (contents.length > 0) {
    return;
  }
  // Directory is empty. Remove it.
  fs.rmdirSync(current);
  // Remove empty parent directory.
  removeEmptyDirectory(path.dirname(current), root);
}


const names = {
  app: 'app',
  client: 'client',
  server: 'server'
};

const config = {
  client: {
    html: {
      entry: `${names.client}/src/index.html`,
      bundle: `${names.app}/${names.client}/index.html`,
      watch: `${names.client}/src/**/*.html`,
      inject: {
        templates: {
          globs: [`${names.client}/src/*/**/*.html`]
        },
        css: {
          globs: [`${names.app}/${names.client}/index-*.css`],
          cwd: `${names.app}/${names.client}`
        },
        js: {
          globs: [
            `${names.app}/${names.client}/vendor-*.js`,
            `${names.app}/${names.client}/index-*.js`
          ],
          cwd: `${names.app}/${names.client}`
        }
      }
    },
    scss: {
      entry: `${names.client}/src/index.scss`,
      bundle: `${names.app}/${names.client}/index.css`,
      watch: `${names.client}/src/**/*.scss`
    },
    ts: {
      entry: `${names.client}/src/index.ts`,
      bundle: `${names.app}/${names.client}/index.js`,
      watch: `${names.client}/src/**/*.ts`,
      tsconfig: `${names.client}/tsconfig.json`
    },
    vendors: {
      manifest: `${names.client}/vendors.json`,
      bundle: `${names.app}/${names.client}/vendor.js`
    }
  },
  server: {
    from: `${names.server}/src`,
    to: `${names.app}/${names.server}`,
    tsconfig: `${names.server}/tsconfig.json`
  },
  resources: {
    images: {
      from: `${names.client}/assets/images`,
      to: `${names.app}/${names.client}/assets/images`,
      manifest: `${names.app}/${names.client}/assets/images/manifest.json`
    }
  },
  gitCommit: `${names.app}/git-sha.txt`
};

const paths = {
  env: '.env'
};

// Read vendors manifest if there is one.
const vendors = jsonfile.readFileSync(`./${config.client.vendors.manifest}`, { throws: false });



/**
 * HTML
 */



/**
 * Generate index.html
 * @param  {Function} done called once index.html is written to disk
 */
function buildHtml(done) {
  done = done || noop;
  timeClient('html build');
  fs.createReadStream(config.client.html.entry)
  .pipe(htmlInjector(config.client.html.inject))
  .pipe(htmlMinifierStream({
    collapseWhitespace: true,
    processScripts: ['text/ng-template']
  }))
  .pipe(source(config.client.html.bundle))
  .pipe(buffer())
  .pipe(revReplace({
    manifest: gulp.src(config.resources.images.manifest)
  }))
  .pipe(gulp.dest('.'))
  .on('finish', () => {
    timeEndClient('html build');
    done();
  });
}

/**
 * Delete index.html
 */
function cleanHtml(done) {
  done = done || noop;
  timeClient('html clean');
  cleanPath(config.client.html.bundle, () => {
    timeEndClient('html clean');
    done();
  });
}

/**
 * Shortcut to clean and build index.html
 * @param  {Function} done called once index.html is written to disk
 */
function rebuildHtml(done) {
  cleanHtml(() => {
    buildHtml(done);
  });
}

/**
 * Rebuild index.html whenever any html file changes.
 * @param  {Function} callback called after index.html is written to disk
 */
function watchHtml(callback) {
  callback = callback || noop;
  logClient('watching html');
  gulp.watch(config.client.html.watch, (event) => {
    logClientWatchEvent(event);
    rebuildHtml(callback);
  });
}

gulp.task('html', function(done) {
  rebuildHtml(done);
});

gulp.task('html:clean', function(done) {
  cleanHtml(done);
});

gulp.task('html:watch', ['html'], function() {
  watchHtml();
});



/**
 * CSS
 */



/**
 * Generate index.css and its sourcemap.
 * @return {stream}
 */
function buildCss(done) {
  done = done || noop;
  timeClient('css build');
  return gulp.src(config.client.scss.entry)
  .pipe(sourcemaps.init())
  .pipe(sass({ outputStyle: 'compressed' }).on('error', sass.logError))
  .pipe(autoprefixer({ browsers: ['last 2 versions'] }))
  .pipe(rename(config.client.scss.bundle))
  .pipe(rev())
  .pipe(sourcemaps.write('.'))
  .pipe(gulp.dest('.'))
  .on('finish', () => {
    done();
    timeEndClient('css build');
  });
}

/**
 * Delete index.css and its sourcemap.
 */
function cleanCss(done) {
  done = done || noop;
  timeClient('css clean');
  glob(hashGlob(config.client.scss.bundle), (error, files) => {
    cleanPaths(files, () => {
      timeEndClient('css clean');
      done();
    });
  });
}

/**
 * Rebuild index.css and its sourcemap whenever any scss file changes.
 * Rebuild index.html to update index.css hash.
 * @param  {Function} callback called after files are written to disk
 */
function watchCss(callback) {
  callback = callback || noop;
  logClient('watching css');
  gulp.watch(config.client.scss.watch, (event) => {
    logClientWatchEvent(event);
    cleanCss(() => {
      buildCss(() => {
        rebuildHtml(callback);
      });
    });
  });
}

gulp.task('css', function(done) {
  cleanCss(() => {
    buildCss(() => {
      rebuildHtml(done);
    });
  });
});

gulp.task('css:clean', function(done) {
  cleanCss(done);
});

gulp.task('css:watch', ['css'], function() {
  watchCss();
});



/**
 * JavaScript
 */

/**
 * NOTE: watchify doesn't trigger update event when files are added, or when
 * those newly added files are saved!
 * NOTE: When using watchify and tsify together, updating a typescript file in
 * one bundle triggers an update event in all bundles. Stick to one typescript
 * bundle until this is resolved.
 * NOTE: This might be fixed with gulp.watch (watchify was removed).
 */

/**
 * Browserify instance for the index.js bundle.
 */
var jsBundle;

/**
 * Bundle js files.
 * @param  {Function} done called after bundle is written to disk
 * @return {stream} browserifyBundleStream
 */
function bundleJs(done) {
  done = done || noop;
  if (!jsBundle) {
    console.error('buildJs() must be called at least once before this point');
    process.exit();
  }
  return jsBundle.bundle()
  .on('error', console.error)
  .pipe(source(config.client.ts.bundle))
  .pipe(buffer())
  .pipe(sourcemaps.init({ loadMaps: true }))
  .pipe(uglify())
  .pipe(rev())
  .pipe(sourcemaps.write('.'))
  .pipe(gulp.dest('.'))
  .on('finish', function() {
    done();
  });
}

/**
 * Generate index.js and its sourcemap.
 * @param  {Function} done called after files are written to disk
 * @return {stream} browserifyBundleStream
 */
function buildJs(done) {
  done = done || noop;
  timeClient('js build');
  const browserifyOptions = {
    cache: {},
    packageCache: {},
    entries: [config.client.ts.entry],
    debug: true
  };

  jsBundle = browserify(browserifyOptions);

  // transpile TypeScript
  jsBundle.plugin(tsify, { project: config.client.ts.tsconfig });

  // replace environment variables
  jsBundle.transform(envify({
    _: 'purge',
    NODE_ENV: process.env.NODE_ENV || 'development'
  }));

  vendors.forEach((vendor) => {
    jsBundle.external(vendor);
  });

  return bundleJs(() => {
    timeEndClient('js build');
    done();
  });
}

/**
 * Rebuild index.js and its sourcemap whenever any typescript file changes.
 * Rebuild index.html to update index.js hash.
 * NOTE: buildJs must be called at least once before this.
 * @param  {Function} callback called after bundle is written to disk
 */
function watchJs(callback) {
  callback = callback || noop;
  logClient('watching js');
  gulp.watch(config.client.ts.watch, (event) => {
    logClientWatchEvent(event);
    cleanJs(() => {
      timeClient('js build (incremental)');
      bundleJs(() => {
        timeEndClient('js build (incremental)');
        rebuildHtml(callback);
      });
    });
  });
}

/**
 * Delete index.js file and its sourcemap.
 */
function cleanJs(done) {
  done = done || noop;
  timeClient('js clean');
  glob(hashGlob(config.client.ts.bundle), (error, files) => {
    cleanPaths(files, () => {
      timeEndClient('js clean');
      done();
    });
  });
}

gulp.task('js', function(done) {
  cleanJs(() => {
    buildJs(() => {
      rebuildHtml(done);
    });
  });
});

gulp.task('js:clean', function(done) {
  cleanJs(done);
});

gulp.task('js:watch', ['js'], function() {
  watchJs();
});



/**
 * Vendor
 */



/**
 * Generate vendor js file and its sourcemap.
 * @return {stream} browserifyBundleStream
 */
function buildVendor(done) {
  done = done || noop;
  timeClient('vendor build');

  const b = browserify({ debug: true });

  vendors.forEach((vendor) => {
    b.require(vendor);
  });

  return b.bundle()
  .on('error', console.error)
  .pipe(source(config.client.vendors.bundle))
  .pipe(buffer())
  .pipe(sourcemaps.init({ loadMaps: true }))
  .pipe(uglify())
  .pipe(rev())
  .pipe(sourcemaps.write('.'))
  .pipe(gulp.dest('.'))
  .on('finish', () => {
    timeEndClient('vendor build');
    done();
  });
};

/**
 * Delete vendor bundle and its sourcemap.
 */
function cleanVendor(done) {
  done = done || noop;
  timeClient('vendor clean');
  glob(hashGlob(config.client.vendors.bundle), (error, files) => {
    cleanPaths(files, () => {
      timeEndClient('vendor clean');
      done();
    });
  });
}

/**
 * Rebuild vendor bundle and its sourcemap whenever vendors.json changes.
 * Rebuild index.html to update file hash.
 * @param  {Function} callback called after files are written to disk
 */
function watchVendor(callback) {
  callback = callback || noop;
  logClient('watching vendor');
  gulp.watch(config.client.vendors.manifest, (event) => {
    logClientWatchEvent(event);
    cleanVendor(() => {
      buildVendor(() => {
        rebuildHtml(callback);
      });
    });
  });
}

gulp.task('vendor', function(done) {
  cleanVendor(() => {
    buildVendor(() => {
      rebuildHtml(done);
    });
  });
});

gulp.task('vendor:clean', function(done) {
  cleanVendor(done);
});

gulp.task('vendor:watch', ['vendor'], function() {
  watchVendor();
});



/**
 * Assets
 */



/**
 * Minify and revision image files.
 * @return {stream}
 */
function buildImages(done) {
  done = done || noop;
  timeClient('images build');
  return gulp.src(path.join(config.resources.images.from, '**/*'))
  .pipe(imagemin())
  .pipe(rev())
  .pipe(gulp.dest(config.resources.images.to))
  .pipe(rev.manifest(config.resources.images.manifest))
  .pipe(gulp.dest('.'))
  .on('finish', () => {
    timeEndClient('images build');
    done();
  });
}

/**
 * Delete image files.
 * @param  {Function} done
 */
function cleanImages(done) {
  done = done || noop;
  timeClient('images clean');
  removeDirectory(config.resources.images.to, () => {
    timeEndClient('images clean');
    done();
  });
}

/**
 * Rebuild images whenever images change.
 * Rebuild index.html to update file hashes.
 * @param  {Function} callback called after files are written to disk
 */
function watchImages(callback) {
  callback = callback || noop;
  logClient('watching images');
  gulp.watch(path.join(config.resources.images.from, '**/*'), (event) => {
    logClientWatchEvent(event);
    cleanImages(() => {
      buildImages(() => {
        rebuildHtml(callback);
      });
    });
  });
}

gulp.task('images', (done) => {
  cleanImages(() => {
    buildImages(() => {
      rebuildHtml(done);
    });
  });
});

gulp.task('images:watch', ['images'], () => {
  watchImages();
});



/**
 * Client
 */

/**
 * Build client files.
 * @param {Function} done called after all client files are written to disk
 */
function buildClient(done) {
  done = done || noop;
  logClient('building...');
  timeClient('build');
  mergeStream([
    buildCss(),
    buildJs(),
    buildVendor(),
    buildImages()
  ])
  .on('finish', function() {
    buildHtml(() => {
      timeEndClient('build');
      done();
    });
  });
}

/**
 * Watch each build cycle independently.
 * @param  {Function} callback passed to each client watch function
 */
function watchClient(callback) {
  callback = callback || noop;
  watchCss(callback);
  watchJs(callback);
  watchVendor(callback);
  watchImages(callback);
  watchHtml(callback);
}

/**
 * Clean client files.
 * @param {Function} done
 */
function cleanClient(done) {
  done = done || noop;
  async.parallel([
    cleanCss,
    cleanJs,
    cleanVendor,
    cleanImages,
    cleanHtml
  ], done);
}

/**
 * Shortcut to clean and build client files.
 * @param  {Function} done called once client files are written to disk
 */
function rebuildClient(done) {
  cleanClient(() => {
    buildClient(done);
  });
}

gulp.task('clean:client', function(done) {
  cleanClient(done);
});

gulp.task('build:client', function(done) {
  rebuildClient(done);
});



/**
 * Server
 */



const serverTypescript = typescript.createProject(config.server.tsconfig);

/**
 * Build server files.
 * @param {Function} done called after files are written to disk
 * @param {boolean} includeMaps indicates whether or not to include sourcemaps
 * @return {stream}
 */
function buildServer(done, includeMaps) {
  done = done || noop;
  logServer('building...');
  timeServer('build');

  var stream = gulp.src(path.join(config.server.from, '**/!(*.spec).ts'));

  if (includeMaps) {
    stream = stream.pipe(sourcemaps.init());
  }

  stream = stream.pipe(serverTypescript());

  if (includeMaps) {
    stream = stream.pipe(sourcemaps.write('.'));
  }

  return stream
  .pipe(addSrc(path.join(config.server.from, '**/*.html')))
  .pipe(gulp.dest(config.server.to))
  .on('finish', () => {
    timeEndServer('build');
    done();
  });
}

/**
 * Watch server files.
 * Rebuild server files with sourcemaps.
 * @param  {Function} callback called whenever a server file changes
 * @param {boolean} includeMaps indicates whether or not to include sourcemaps
 */
function watchServer(callback, includeMaps) {
  callback = callback || noop;
  logServer('watching all files');
  gulp.watch(path.join(config.server.from, '**/*'), (event) => {
    logServerWatchEvent(event);
    rebuildServer(callback, !!includeMaps);
  });
}

/**
 * Clean server files.
 * @param {Function} done
 */
function cleanServer(done) {
  removeDirectory(config.server.to, done);
}

/**
 * Shortcut to clean and build server files.
 * @param  {Function} done called once server files are written to disk
 * @param {boolean} includeMaps indicates whether or not to include sourcemaps
 */
function rebuildServer(done, includeMaps) {
  cleanServer(() => {
    buildServer(done, !!includeMaps);
  });
}

gulp.task('clean:server', (done) => {
  cleanServer(done);
});

gulp.task('build:server', (done) => {
  rebuildServer(done);
});



/**
 * Git commit
 */

function writeGitCommit(done) {
  done = done || noop;
  const commit = child_process.execSync('git rev-parse HEAD');
  fsExtra.outputFile(config.gitCommit, commit, (err) => {
    if (err) console.log(err);
    done();
  });
}

function cleanGitCommit(done) {
  done = done || noop;
  cleanPath(config.gitCommit, done);
}

gulp.task('git-commit', (done) => {
  writeGitCommit(done);
});



/**
 * App
 */

function build(done, includeMaps) {
  done = done || noop;
  async.parallel([
    buildClient,
    (then) => buildServer(then, !!includeMaps),
    writeGitCommit
  ], done);
}

function clean(done) {
  done = done || noop;
  async.parallel([
    cleanClient,
    cleanServer,
    cleanGitCommit
  ], done);
}

function watch(callback, includeMaps) {
  watchClient(callback);
  watchServer(callback, !!includeMaps);
}

gulp.task('clean', (done) => {
  clean(done);
});

// If we use gulp subtasks, the time report for this task is not useful.
gulp.task('build', ['clean'], (done) => {
  build(done);
});

gulp.task('watch', ['clean'], (done) => {
  build(() => {
    watch();
    done();
  });
});



/**
 * Dev
 */



/**
 * Proxy server state
 */
const proxy = {
  server: null,
  target: null,
  host: null,
  port: null
};

/**
 * Launch or reload proxy server once app server is ready.
 * @param {Function} done called proxy server reloads or initializes
 */
function launchProxyServer(done) {
  done = done || noop;
  const targetIp = process.env.IP || '0.0.0.0';
  const targetPort = parseInt(process.env.PORT) || 9000;
  const target = `http://${targetIp}:${targetPort}`;
  const host = process.env.DEV_HOST || 'local';
  const port = process.env.DEV_PORT || '7000';
  const proxyServerName = 'proxy';
  tcp.waitUntilUsedOnHost(targetPort, targetIp, 100, 1000000)
  .then(() => {
    // If browser-sync configuration is still valid, reload.
    // Otherwise, create new browser-sync server.
    if (proxy.server) {
      if (proxy.target === target && proxy.host === host && proxy.port === port) {
        proxy.server.reload();
        return done();
      } else {
        proxy.server.exit();
      }
    }

    // update state
    proxy.server = browserSync.create(proxyServerName);
    proxy.server.init({
      proxy: target,
      browser: 'google chrome',
      open: host,
      port: port
    }, done);
    proxy.target = target;
    proxy.host = host;
    proxy.port = port;
  })
  .catch((err) => {
    console.error(err.message);
  });
}



var busy = false;
/**
 * Launch or restart app server.
 * @param {Function} done called after child process spawns
 * @param {boolean} debug activates node debug mode
 */
function launchServer(done, debug) {
  if (busy) {
    return;
  }

  // Stay busy until child process exits.
  busy = true;

  done = done || noop;

  // TODO: if debug is true, use flags --debug --debug-brk when running app

  // Build and run app.
  const dockerCompose = child_process.spawn('docker-compose', ['up', '-d', '--build', '-t', '0', 'app']);
  dockerCompose.stdout.on('data', (data) => process.stdout.write(data));
  dockerCompose.stderr.on('data', (data) => process.stdout.write(data));
  dockerCompose.on('exit', (code) => {
    busy = false;
    done();
  });
}



/**
 * Build and serve app.
 * @param {Function} done called after servers have launched
 * @param {boolean} debug activates node debug mode and sourcemaps
 */
function serve(done, debug) {
  done = done || noop;
  debug = !!debug;
  build(() => {
    launchServer(() => {
      launchProxyServer(done);
    }, debug);
  }, debug);
}

/**
 * Serve app and watch files for changes.
 * @param {Function} done called after servers have launched
 * @param {boolean} debug activates node debug mode and sourcemaps
 */
function dev(done, debug) {
  done = done || noop;
  debug = !!debug;

  // load environment variables into process.env
  dotenv.config({ path: paths.env });

  serve(() => {
    gulp.watch([paths.env], (event) => {
      logEnvironmentWatchEvent(event);
      serve();
    });
    watchClient(() => {
      launchProxyServer();
    });
    watchServer(() => {
      launchServer(launchProxyServer, debug);
    }, debug);
    done();
  }, debug);
}

gulp.task('dev', ['clean'], (done) => {
  dev(done, false);
});

gulp.task('dev:debug', ['clean'], (done) => {
  dev(done, true);
})



/**
 * Loggers
 */



// Client

const clientLogPrefix = chalk.cyan('[client]');

function logClient(message) {
  console.log(clientLogPrefix, message);
}

function logClientWatchEvent(event) {
  logClient(`${event.path} ${event.type}`);
}

function timeClient(key) {
  console.time(`${clientLogPrefix} ${key}`);
}

function timeEndClient(key) {
  console.timeEnd(`${clientLogPrefix} ${key}`);
}

// Server

const serverLogPrefix = chalk.yellow('[server]');

function logServer(message) {
  console.log(serverLogPrefix, message);
}

function logServerWatchEvent(event) {
  logServer(`${event.path} ${event.type}`);
}

function timeServer(key) {
  console.time(`${serverLogPrefix} ${key}`);
}

function timeEndServer(key) {
  console.timeEnd(`${serverLogPrefix} ${key}`);
}

// Environment

const environmentLogPrefix = chalk.green('[env]');

function logEnvironment(message) {
  console.log(environmentLogPrefix, message);
}

function logEnvironmentWatchEvent(event) {
  logEnvironment(`${event.path} ${event.type}`);
}



// TODO: test tasks
