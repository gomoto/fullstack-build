const autoprefixer = require('gulp-autoprefixer')
const deepExtend = require('deep-extend')
const gulp = require('gulp')
const rename = require('gulp-rename')
const rev = require('gulp-rev')
const sass = require('gulp-sass')
const sourcemaps = require('gulp-sourcemaps')

const IllegalArgumentException = require('../exceptions/illegal-argument-exception')

/**
 * Generate index.css bundle.
 * @return {Promise}
 */
module.exports = function buildScss(entry, bundle, options) {
  if (typeof entry !== 'string') throw new IllegalArgumentException('entry')
  if (typeof bundle !== 'string') throw new IllegalArgumentException('bundle')
  options = deepExtend({
    rev: true,
    sourcemaps: true
  }, options)
  return new Promise((resolve, reject) => {
    let stream = gulp.src(entry)
    if (options.sourcemaps) {
      stream = stream.pipe(sourcemaps.init())
    }
    stream = stream.pipe(
      sass({ outputStyle: 'compressed' })
      .on('error', function onSassError(error) {
        sass.logError.call(this, error)
        reject()
      })
    )
    .pipe(autoprefixer({ browsers: ['last 2 versions'] }))
    .pipe(rename(bundle))
    if (options.rev) {
      stream = stream.pipe(rev())
    }
    if (options.sourcemaps) {
      stream = stream.pipe(sourcemaps.write('.'))
    }
    stream.pipe(gulp.dest('/'))
    .on('finish', () => {
      resolve()
    })
  })
}
