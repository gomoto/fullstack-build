const scss = require('./lib/scss')

const config = require('./config')({
  file: process.env.FULLSTACK_CONFIG
})

console.time('scss')
scss.build(
  config.client.scss.entry,
  config.client.scss.bundle,
  {rev: false}
)
.then(() => {
  console.timeEnd('scss')
})
.catch(() => {
  console.log('ERROR IN SCSS TASK')
  process.exit(1)
})
