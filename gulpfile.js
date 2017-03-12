// Module require() is relative to current working directory.
// Local require(./[...]) is relative to __dirname and cannot be used to access
// project files.
const addSrc = require('gulp-add-src');
const async = require('async');
const autoprefixer = require('gulp-autoprefixer');
const browserify = require('browserify-incremental');
const buffer = require('vinyl-buffer');
const chalk = require('chalk');
const child_process = require('child_process');
const concat = require('gulp-concat');
const fs = require('fs');
const fsExtra = require('fs-extra');
const gulp = require('gulp');
const htmlInjector = require('html-injector');
const htmlMinifierStream = require('html-minifier-stream');
const imagemin = require('gulp-imagemin');
const livereload = require('gulp-livereload');
const path = require('path');
const rename = require('gulp-rename');
const rev = require('gulp-rev');
const revReplace = require('gulp-rev-replace');
const rimraf = require('rimraf');
const sass = require('gulp-sass');
const source = require('vinyl-source-stream');
const sourcemaps = require('gulp-sourcemaps');
const tsify = require('tsify');
const typescript = require('gulp-typescript');
const uglify = require('gulp-uglify');
const wiredep = require('wiredep');

// Provide copy of internal config
const config = require('./config')();
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
  rimraf(entity, () => {
    // Remove empty directories until root is reached.
    removeEmptyDirectory(path.dirname(entity), '/');
    done();
  });
}

/**
 * Remove empty directories until we reach a non-empty directory, an unremovable
 * directory (e.g., mounted volume), or the root directory.
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
  // Directory is empty.
  try {
    // Remove directory.
    fs.rmdirSync(current);
  } catch (e) {
    // Cannot remove mounted directories.
    return;
  }
  // Remove empty parent directory.
  removeEmptyDirectory(path.dirname(current), root);
}



// function spawn(command, args, options, done) {
//   done = done || noop;
//   // Guard against accidentally invoking handler functions multiple times.
//   let alreadyDone = false;
//   const fork = child_process.spawn(command, args, options);
//   fork.stdout.on('data', (data) => process.stdout.write(data));
//   fork.stderr.on('data', (data) => process.stderr.write(data));
//   fork.on('error', (err) => {
//     if (alreadyDone) return;
//     alreadyDone = true;
//     done(err);
//   });
//   fork.on('exit', () => {
//     if (alreadyDone) return;
//     alreadyDone = true;
//     done();
//   });
// }


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
    config.client.html.bundle
  )) {
    logSkip('html');
    return done();
  }

  timeClient('html build');

  let htmlStream = fs.createReadStream(config.client.html.entry)
  .pipe(htmlInjector(config.client.html.inject))
  .pipe(htmlMinifierStream({
    collapseWhitespace: true,
    processScripts: ['text/ng-template']
  }))
  .pipe(source(config.client.html.bundle))
  .pipe(buffer());

  // Run rev-replace only if image manifest is defined.
  if (config.resources.images.manifest) {
    htmlStream = htmlStream.pipe(revReplace({
      manifest: gulp.src(config.resources.images.manifest)
    }));
  }

  htmlStream.pipe(gulp.dest('/'))
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
    rebuildHtml(() => {
      config.client.html.watch.post(event);
    });
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
        rebuildHtml(() => {
          config.client.scss.watch.post(event);
        });
      });
    });
  });
  config.client.scss.watch.init();
}



/**
 * JavaScript (modules)
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
    config.client.ts.tsconfig
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

  forEachVendor((vendor) => {
    console.log(`Excluding from main bundle: ${vendor}`);
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
        rebuildHtml(() => {
          config.client.ts.watch.post(event);
        });
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
 * JavaScript (namespaces)
 */



let clientTypescript;
if (config.client.cats.tsconfig) {
  clientTypescript = typescript.createProject(config.client.cats.tsconfig);
} else {
  clientTypescript = null;
}

/**
 * Concatenate TypeScript files.
 * Generate index.js and its sourcemap.
 * @param  {Function} done called after files are written to disk
 */
function buildCats(done) {
  const taskName = 'concat-ts-build';
  done = done || noop;
  if (!(
    config.client.cats.sources.length > 0 &&
    config.client.cats.bundle &&
    config.client.cats.tsconfig
  )) {
    logSkip(taskName);
    return done();
  }
  timeClient(taskName);
  return gulp.src(config.client.cats.sources)
  .pipe(sourcemaps.init())
  .pipe(clientTypescript())
  .pipe(concat(config.client.cats.bundle))
  .pipe(uglify())
  .pipe(rev())
  .pipe(sourcemaps.write('.'))
  .pipe(gulp.dest('/'))
  .on('finish', () => {
    timeEndClient(taskName);
    done();
  });
}

/**
 * Delete index.js file and its sourcemap.
 */
function cleanCats(done) {
  const taskName = 'concat-ts-clean';
  done = done || noop;
  if (!config.client.cats.bundle) {
    logSkip(taskName);
    return done();
  }
  timeClient(taskName);
  removePath(hashGlob(config.client.cats.bundle), () => {
    timeEndClient(taskName);
    done();
  });
}

/**
 * Rebuild index.js and its sourcemap whenever any TypeScript file changes.
 * Rebuild index.html to update index.js hash.
 * Incremental builds happen because of gulp-typescript.
 * Callback called after bundle is written to disk.
 */
function watchCats() {
  if (!config.client.cats.watch.glob) {
    return;
  }
  logClient('watching concat-ts');
  gulp.watch(config.client.cats.watch.glob, (event) => {
    logClientWatchEvent(event);
    config.client.cats.watch.pre(event);
    cleanCats(() => {
      buildCats(() => {
        rebuildHtml(() => {
          config.client.cats.watch.post(event);
        });
      });
    });
  });
  config.client.cats.watch.init();
}



/**
 * Vendor
 */



/**
 * Call callback for each vendor that passes the test.
 * @param {Function} callback
 */
function forEachVendor(callback) {
  if (!config.client.vendors.manifest) {
    return;
  }
  const pkg = require(config.client.vendors.manifest);
  Object.keys(pkg.dependencies).forEach((vendor) => {
    if (!config.client.vendors.test(vendor)) {
      return;
    }
    callback(vendor);
  });
}



/**
 * Generate vendor js file and its sourcemap.
 * @return {stream} browserifyBundleStream
 */
function buildVendor(done) {
  done = done || noop;
  if (!(
    config.client.vendors.bundle &&
    config.client.vendors.manifest //package.json
  )) {
    logSkip('vendor');
    return done();
  }
  timeClient('vendor build');

  const b = browserify({ debug: true });

  forEachVendor((vendor) => {
    console.log(`Adding to vendor bundle: ${vendor}`);
    // QUESTION: Can we assume node_modules will be installed next to manifest?
    b.require(`./node_modules/${vendor}`, {
      basedir: path.dirname(config.client.vendors.manifest),
      expose: vendor
    });
  });

  // Only call callback once.
  let failed = false;
  return b.bundle()
  .on('error', (err) => {
    console.error(err);
    if (failed) return;
    failed = true;
    done(new Error('Failed buildVendor'));
  })
  .pipe(source(config.client.vendors.bundle))
  .pipe(buffer())
  .pipe(sourcemaps.init({ loadMaps: true }))
  .pipe(uglify())
  .pipe(rev())
  .pipe(sourcemaps.write('.'))
  .pipe(gulp.dest('/'))
  .on('finish', () => {
    if (failed) return;
    timeEndClient('vendor build');
    done();
  });
}

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
 * Rebuild vendor bundle and its sourcemap whenever client package.json changes.
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
        rebuildHtml(() => {
          config.client.vendors.watch.post(event);
        });
      });
    });
  });
  config.client.vendors.watch.init();
}



/**
 * Bower Vendor
 */



/**
 * Build bower vendor bundle.
 */
function buildBowerVendor(done) {
  const taskName = 'bower-vendor-build';
  done = done || noop;
  if (!(
    config.client.bower.bundle &&
    config.client.bower.manifest &&
    config.client.bower.components
  )) {
    logSkip(taskName);
    return done();
  }
  timeClient(taskName);
  const bowerDeps = wiredep({
    directory: config.client.bower.components,
    bowerJson: require(config.client.bower.manifest)
  });
  return gulp.src(bowerDeps.js)
  .pipe(sourcemaps.init({ loadMaps: true }))
  .pipe(concat(config.client.bower.bundle))
  .pipe(uglify())
  .pipe(rev())
  .pipe(sourcemaps.write('.'))
  .pipe(gulp.dest('/'))
  .on('finish', () => {
    done();
    timeEndClient(taskName);
  });
}

 /**
  * Delete bower vendor bundle and its sourcemap.
  */
 function cleanBowerVendor(done) {
   const taskName = 'bower-vendor-clean';
   done = done || noop;
   if (!config.client.bower.bundle) {
     logSkip(taskName);
     return done();
   }
   timeClient(taskName);
   removePath(hashGlob(config.client.bower.bundle), () => {
     timeEndClient(taskName);
     done();
   });
 }

 /**
  * Rebuild bower vendor bundle and its sourcemap whenever something changes.
  * Rebuild index.html to update file hash.
  * Callback called after files are written to disk.
  */
 function watchBowerVendor() {
   if (!config.client.bower.watch.glob) {
     return;
   }
   logClient('watching vendor');
   gulp.watch(config.client.bower.watch.glob, (event) => {
     logClientWatchEvent(event);
     config.client.bower.watch.pre(event);
     cleanBowerVendor(() => {
       buildBowerVendor(() => {
         rebuildHtml(() => {
           config.client.bower.watch.post(event);
         });
       });
     });
   });
   config.client.bower.watch.init();
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
    config.resources.images.watch.pre(event);
    cleanImages(() => {
      buildImages(() => {
        rebuildHtml(() => {
          config.resources.images.watch.post(event);
        });
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
    buildCats,
    buildVendor,
    buildBowerVendor,
    buildImages
  ], (err) => {
    if (err) return done(err);
    buildHtml((err) => {
      if (err) return done(err);
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
  watchCats();
  watchVendor();
  watchBowerVendor();
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
    cleanCats,
    cleanVendor,
    cleanBowerVendor,
    cleanImages,
    cleanHtml
  ], done);
}



/**
 * Copy server node_modules to build directory.
 */
function copyNodeModules(done) {
 done = done || noop;
 let skip = false;
 if (!config.server.node_modules.from) {
   console.log('undefined: config.server.node_modules.from');
   skip = true;
 }
 if (!config.server.node_modules.to) {
   console.log('undefined: config.server.node_modules.to');
   skip = true;
 }
 if (skip) {
   logSkip('server node_modules');
   return done();
 }
 timeServer('copy-node-modules');
 fsExtra.copy(config.server.node_modules.from, config.server.node_modules.to, (err) => {
   if (err) {
     console.error(err);
     return done(err);
   }
   timeEndServer('copy-node-modules');
   done();
 });
}

/**
 * Server JavaScript
 */

let serverTypescript;
if (config.server.ts.tsconfig) {
  serverTypescript = typescript.createProject(config.server.ts.tsconfig);
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
    config.server.ts.from &&
    config.server.ts.to
  )) {
    logSkip('server js');
    return done();
  }

  timeServer('js build');

  var stream = gulp.src(path.join(config.server.ts.from, '**/!(*.spec).ts'));

  if (includeMaps) {
    console.log('building server js with sourcemaps');
    stream = stream.pipe(sourcemaps.init());
  }

  stream = stream.pipe(serverTypescript());

  if (includeMaps) {
    stream = stream.pipe(sourcemaps.write('.'));
  }

  return stream
  // TODO: separate build/watch/clean tasks for server html
  .pipe(addSrc(path.join(config.server.ts.from, '**/*.html')))
  .pipe(gulp.dest(config.server.ts.to))
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
    copyNodeModules,
    (then) => buildServerJs(then, includeMaps)
  ], () => {
    timeEndServer('build');
    done();
  });
}



/**
 * Watch each build cycle independently.
 */
function watchServer(includeMaps) {
  watchServerNodeModules();
  watchServerJs(includeMaps);
  config.server.watch.init(services);
}


function watchServerNodeModules() {
  if (!config.server.node_modules.watch.glob) {
    return;
  }
  logServer('watching server node_modules');
  gulp.watch(config.server.node_modules.watch.glob, (event) => {
    logServerWatchEvent(event);
    config.server.node_modules.watch.pre(event);
    cleanNodeModules(() => {
      copyNodeModules(() => {
        config.server.node_modules.watch.post(event, services);
      });
    });
  });
  config.server.node_modules.watch.init(services);
}

/**
 * Watch server typescript files.
 * Rebuild server typescript files with sourcemaps.
 * Callback called whenever a server file changes.
 * @param {boolean} includeMaps indicates whether or not to include sourcemaps
 */
function watchServerJs(includeMaps) {
  if (!config.server.ts.from) {
    return;
  }
  logServer('watching server js');
  gulp.watch(path.join(config.server.ts.from, '**/*'), (event) => {
    logServerWatchEvent(event);
    config.server.ts.watch.pre(event);
    cleanServerJs(() => {
      buildServerJs(() => {
        config.server.ts.watch.post(event, services);
      }, !!includeMaps);
    });
  });
  config.server.ts.watch.init(services);
}

function cleanNodeModules(done) {
  done = done || noop;
  if (!config.server.node_modules.to) {
    logSkip('server node_modules clean');
    return done();
  }
  timeServer('node_modules clean');
  removePath(config.server.node_modules.to, () => {
    timeEndServer('node_modules clean');
    done();
  });
}

/**
 * Clean server js files.
 * @param {Function} done
 */
function cleanServerJs(done) {
  done = done || noop;
  if (!config.server.ts.to) {
    logSkip('server js clean');
    return done();
  }
  timeServer('js clean');
  removePath(config.server.ts.to, () => {
    timeEndServer('js clean');
    done();
  });
}

/**
 * Clean server files.
 * @param {Function} done
 */
function cleanServer(done) {
  done = done || noop;
  async.parallel([
    cleanServerJs,
    cleanNodeModules
  ], done);
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
  console.log(`Writing latest git commit to ${config.gitCommit}`);
  // const commit = child_process.execSync(`cd ${internalConfig.src} && git rev-parse HEAD`);
  // fsExtra.outputFile(config.gitCommit, commit, (err) => {
  //   if (err) console.log(err);
  //   done();
  // });
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

function watch(includeMaps) {
  watchClient();
  watchServer(!!includeMaps);
}

gulp.task('clean', (done) => {
  clean(done);
});

// If we use gulp subtasks, the time report for this task is not useful.
gulp.task('build', ['clean'], (done) => {
  build((err) => {
    if (err) {
      console.error('BUILD ERROR:', err);
      return process.exit(1);
    }
    done();
  });
});

gulp.task('watch', ['clean'], (done) => {
  build(() => {
    watch(true);
    done();
  }, true);
});



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

// Skip

function logSkip(task) {
  console.log(`Skipping [${task}]`);
}



// TODO: test tasks
