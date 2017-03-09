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
const fs = require('fs');
const fsExtra = require('fs-extra');
const gulp = require('gulp');
const htmlInjector = require('html-injector');
const htmlMinifierStream = require('html-minifier-stream');
const imagemin = require('gulp-imagemin');
const jsonfile = require('jsonfile');
const livereload = require('gulp-livereload');
const path = require('path');
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

// Absolute paths
const internalConfig = {
  src: '/src',
  build: '/build'
};

// Provide copy of internal config
const config = require('./config')({
  src: internalConfig.src,
  build: internalConfig.build
});
const noop = Function.prototype;

const DockerServiceFactory = require('./docker-service');

// Create a DockerService instance for each key in config.services object.
// DockerService instance are exposed to the project configuration module.
const services = {};
Object.keys(config.services).forEach((key) => {
  console.log(`Creating service: ${key}`);
  services[key] = DockerServiceFactory(config.services[key]);
});

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
 * Remove file or directory. Then remove ancestor directories that are empty.
 * Entity can be a glob.
 */
function removePath(entity, done) {
  done = done || noop;
  // If you need to go to parent of build directory to get to entity, then
  // entity is not inside build directory. This check also works on globs.
  if (path.relative(internalConfig.build, entity).slice(0,2) === '..') {
    throw new Error('entity must live inside build directory');
  }
  rimraf(entity, () => {
    // Remove empty directories until build  directory is reached.
    removeEmptyDirectory(path.dirname(entity), internalConfig.build);
    done();
  });
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

const paths = {
  env: '.env'
};

// Read vendors manifest if there is one.
let vendors;
if (config.client.vendors.manifest) {
  vendors = jsonfile.readFileSync(`${config.client.vendors.manifest}`, { throws: false });
} else {
  vendors = [];
}



/**
 * npm install
 */

/**
 * Install npm packages in given directory.
 * @param {string} pkg path to package.json
 * @param {Function} done
 */
function npmInstall(pkg, done) {
  done = done || noop;
  if (!pkg) {
    logSkip('npm-install');
    return done();
  }
  timeClient(`npm-install ${pkg}`);
  spawn('npm', ['install', '--only=production'], { cwd: path.dirname(pkg) }, (err) => {
    timeEndClient(`npm-install ${pkg}`);
    done(err);
  });
}

function spawn(command, args, options, done) {
  done = done || noop;
  // Guard against accidentally invoking handler functions multiple times.
  let alreadyDone = false;
  const fork = child_process.spawn(command, args, options);
  fork.stdout.on('data', (data) => process.stdout.write(data));
  fork.stderr.on('data', (data) => process.stderr.write(data));
  fork.on('error', (err) => {
    if (alreadyDone) return;
    alreadyDone = true;
    done(err);
  });
  fork.on('exit', () => {
    if (alreadyDone) return;
    alreadyDone = true;
    done();
  });
}


/**
 * HTML
 */



/**
 * Generate index.html
 * @param  {Function} done called once index.html is written to disk
 */
function buildHtml(done) {
  done = done || noop;

  if (!(
    config.client.html.entry &&
    config.client.html.bundle &&
    config.client.html.inject &&
    config.resources.images.manifest
  )) {
    logSkip('html');
    return done();
  }

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
  .pipe(gulp.dest('/'))
  .on('finish', () => {
    timeEndClient('html build');
    done();
  })
  .pipe(livereload());
}

/**
 * Delete index.html
 */
function cleanHtml(done) {
  done = done || noop;
  if (!config.client.html.bundle) {
    logSkip('html-clean');
    return done();
  }
  timeClient('html clean');
  removePath(config.client.html.bundle, () => {
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
 * Callback called after index.html is written to disk.
 */
function watchHtml() {
  if (!config.client.html.watch.glob) {
    return;
  }
  logClient('watching html');
  gulp.watch(config.client.html.watch.glob, (event) => {
    logClientWatchEvent(event);
    config.client.html.watch.pre(event);
    rebuildHtml(config.client.html.watch.post);
  });
  config.client.html.watch.init();
}



/**
 * CSS
 */



/**
 * Generate index.css and its sourcemap.
 * @return {stream}
 */
function buildCss(done) {
  done = done || noop;
  if (!(
    config.client.scss.entry &&
    config.client.scss.bundle
  )) {
    logSkip('scss');
    return done();
  }
  timeClient('css build');
  return gulp.src(config.client.scss.entry)
  .pipe(sourcemaps.init())
  .pipe(sass({ outputStyle: 'compressed' }).on('error', sass.logError))
  .pipe(autoprefixer({ browsers: ['last 2 versions'] }))
  .pipe(rename(config.client.scss.bundle))
  .pipe(rev())
  .pipe(sourcemaps.write('.'))
  .pipe(gulp.dest('/'))
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
  if (!config.client.scss.bundle) {
    logSkip('scss-clean');
    return done();
  }
  timeClient('css clean');
  removePath(hashGlob(config.client.scss.bundle), () => {
    timeEndClient('css clean');
    done();
  });
}

/**
 * Rebuild index.css and its sourcemap whenever any scss file changes.
 * Rebuild index.html to update index.css hash.
 * Callback called after files are written to disk.
 */
function watchCss() {
  if (!config.client.scss.watch.glob) {
    return;
  }
  logClient('watching css');
  gulp.watch(config.client.scss.watch.glob, (event) => {
    logClientWatchEvent(event);
    config.client.scss.watch.pre(event);
    cleanCss(() => {
      buildCss(() => {
        rebuildHtml(config.client.scss.watch.post);
      });
    });
  });
  config.client.scss.watch.init();
}



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
  if (!config.client.ts.bundle) {
    return done();
  }
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
  .pipe(gulp.dest('/'))
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
  if (!(
    config.client.ts.entry &&
    config.client.ts.tsconfig &&
    config.client.vendors.manifest //vendors
  )) {
    logSkip('ts');
    return done();
  }
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
 * Callback called after bundle is written to disk.
 */
function watchJs() {
  if (!config.client.ts.watch.glob) {
    return;
  }
  logClient('watching js');
  gulp.watch(config.client.ts.watch.glob, (event) => {
    logClientWatchEvent(event);
    config.client.ts.watch.pre(event);
    cleanJs(() => {
      timeClient('js build (incremental)');
      bundleJs(() => {
        timeEndClient('js build (incremental)');
        rebuildHtml(config.client.ts.watch.post);
      });
    });
  });
  config.client.ts.watch.init();
}

/**
 * Delete index.js file and its sourcemap.
 */
function cleanJs(done) {
  done = done || noop;
  if (!config.client.ts.bundle) {
    logSkip('ts-clean');
    return done();
  }
  timeClient('js clean');
  removePath(hashGlob(config.client.ts.bundle), () => {
    timeEndClient('js clean');
    done();
  });
}



/**
 * Vendor
 */



/**
 * Generate vendor js file and its sourcemap.
 * @return {stream} browserifyBundleStream
 */
function buildVendor(done) {
  done = done || noop;
  if (!(
    config.client.vendors.bundle &&
    config.client.vendors.manifest //vendors
  )) {
    logSkip('vendor');
    return done();
  }
  timeClient('vendor build');

  const b = browserify({ debug: true });

  vendors.forEach((vendor) => {
    // b.require(vendor);// For testing vendor-loading failures.
    // Vendor modules must be required relative to src directory.
    b.require(`./node_modules/${vendor}`, {
      basedir: path.dirname(config.client.package),
      expose: vendor
    });
  });

  return b.bundle()
  .on('error', console.error)
  .pipe(source(config.client.vendors.bundle))
  .pipe(buffer())
  .pipe(sourcemaps.init({ loadMaps: true }))
  .pipe(uglify())
  .pipe(rev())
  .pipe(sourcemaps.write('.'))
  .pipe(gulp.dest('/'))
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
  if (!config.client.vendors.bundle) {
    logSkip('vendor-clean');
    return done();
  }
  timeClient('vendor clean');
  removePath(hashGlob(config.client.vendors.bundle), () => {
    timeEndClient('vendor clean');
    done();
  });
}

/**
 * Rebuild vendor bundle and its sourcemap whenever vendors.json changes.
 * Rebuild index.html to update file hash.
 * Callback called after files are written to disk.
 */
function watchVendor() {
  if (!config.client.vendors.manifest) {
    return;
  }
  logClient('watching vendor');
  gulp.watch(config.client.vendors.manifest, (event) => {
    logClientWatchEvent(event);
    config.client.vendors.watch.pre(event);
    cleanVendor(() => {
      buildVendor(() => {
        rebuildHtml(config.client.vendors.watch.post);
      });
    });
  });
  config.client.vendors.watch.init();
}



/**
 * Assets
 */



/**
 * Minify and revision image files.
 * @return {stream}
 */
function buildImages(done) {
  done = done || noop;
  if (!(
    config.resources.images.from &&
    config.resources.images.to &&
    config.resources.images.manifest
  )) {
    logSkip('images');
    return done();
  }
  timeClient('images build');
  return gulp.src(path.join(config.resources.images.from, '**/*'))
  .pipe(imagemin())
  .pipe(rev())
  .pipe(gulp.dest(config.resources.images.to))
  .pipe(rev.manifest(config.resources.images.manifest))
  .pipe(gulp.dest('/'))
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
  if (!config.resources.images.to) {
    logSkip('images-clean');
    return done();
  }
  timeClient('images clean');
  removePath(config.resources.images.to, () => {
    timeEndClient('images clean');
    done();
  });
}

/**
 * Rebuild images whenever images change.
 * Rebuild index.html to update file hashes.
 * Callback called after files are written to disk.
 */
function watchImages() {
  if (!config.resources.images.from) {
    return;
  }
  logClient('watching images');
  gulp.watch(path.join(config.resources.images.from, '**/*'), (event) => {
    logClientWatchEvent(event);
    config.client.images.watch.pre(event);
    cleanImages(() => {
      buildImages(() => {
        rebuildHtml(config.resources.images.watch.post);
      });
    });
  });
  config.resources.images.watch.init();
}



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
  async.parallel([
    buildCss,
    buildJs,
    buildVendor,
    buildImages
  ], () => {
    buildHtml(() => {
      timeEndClient('build');
      done();
    });
  });
}

/**
 * Watch each build cycle independently.
 */
function watchClient() {
  livereload.listen();
  watchCss();
  watchJs();
  watchVendor();
  watchImages();
  watchHtml();
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



/**
 * Copy server package.json to build directory.
 */
function copyPackage(done) {
 done = done || noop;
 if (!config.server.package) {
   logSkip('server package.json');
   return done();
 }
 timeServer('copy-package');
 const to = `${internalConfig.build}/${path.relative(internalConfig.src, config.server.package)}`;
 fsExtra.copy(config.server.package, to, (err) => {
   if (err) {
     console.error(err);
     return done(err);
   }
   timeEndServer('copy-package');
   done();
 });
}

/**
 * Server JavaScript
 */

let serverTypescript;
if (config.server.tsconfig) {
  serverTypescript = typescript.createProject(config.server.tsconfig);
} else {
  serverTypescript = null;
}

/**
 * Build server typescript files.
 * @param {Function} done called after files are written to disk
 * @param {boolean} includeMaps indicates whether or not to include sourcemaps
 * @return {stream}
 */
function buildServerJs(done, includeMaps) {
  done = done || noop;
  if (!(
    config.server.from &&
    config.server.to
  )) {
    logSkip('server js');
    return done();
  }

  timeServer('js build');

  var stream = gulp.src(path.join(config.server.from, '**/!(*.spec).ts'));

  if (includeMaps) {
    console.log('building server js with sourcemaps');
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
    timeEndServer('js build');
    done();
  });
}



/**
 * Build server files.
 * @param {Function} done called after all server files are written to disk
 */
function buildServer(done, includeMaps) {
  if (includeMaps) console.log('building server with sourcemaps');
  done = done || noop;
  logServer('building...');
  timeServer('build');
  async.parallel([
    copyPackage,
    (then) => buildServerJs(then, includeMaps)
  ], () => {
    timeEndServer('build');
    done();
  });
}



/**
 * Watch server files.
 * Rebuild server files with sourcemaps.
 * Callback called whenever a server file changes.
 * @param {boolean} includeMaps indicates whether or not to include sourcemaps
 */
function watchServer(includeMaps) {
  if (!config.server.from) {
    return;
  }
  logServer('watching all files');
  gulp.watch(path.join(config.server.from, '**/*'), (event) => {
    logServerWatchEvent(event);
    config.server.watch.pre(event);
    rebuildServer(() => {
      config.server.watch.post(services);
    }, !!includeMaps);
  });
  config.server.watch.init(services);
}

/**
 * Clean server files.
 * @param {Function} done
 */
function cleanServer(done) {
  done = done || noop;
  if (!config.server.to) {
    logSkip('server-clean');
    return done();
  }
  removePath(config.server.to, done);
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



/**
 * Git commit
 */

function writeGitCommit(done) {
  done = done || noop;
  if (!config.gitCommit) {
    logSkip('gitCommit');
    return done();
  }
  const commit = child_process.execSync(`cd ${internalConfig.src} && git rev-parse HEAD`);
  fsExtra.outputFile(config.gitCommit, commit, (err) => {
    if (err) console.log(err);
    done();
  });
}

function cleanGitCommit(done) {
  done = done || noop;
  if (!config.gitCommit) {
    logSkip('gitCommit-clean');
    return done();
  }
  removePath(config.gitCommit, done);
}



/**
 * App
 */

function build(done, includeMaps) {
  done = done || noop;
  if (includeMaps) console.log('building with sourcemaps');
  // Install packages in project directory.
  // Type support in IDEs assumes packages are installed alongside source code.
  npmInstall(config.client.package, (err) => {
    if (err) return done(err);
    npmInstall(config.server.package, (err) => {
      if (err) return done(err);
      // Build, finally
      async.parallel([
        buildClient,
        (then) => buildServer(then, !!includeMaps),
        writeGitCommit
      ], done);
    });
  });
}

function clean(done) {
  done = done || noop;
  async.parallel([
    cleanClient,
    cleanServer,
    cleanGitCommit
  ], done);
}

function watch(includeMaps) {
  watchClient();
  watchServer(!!includeMaps);
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
    watch(true);
    done();
  }, true);
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

function logSkip(task) {
  console.log(`Skipping [${task}]`);
}



// TODO: test tasks
