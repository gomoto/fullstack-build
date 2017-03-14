const child_process = require('child_process');
const deepExtend = require('deep-extend');

function DockerComposeFactory(options) {
  return new DockerCompose(options);
}

class DockerCompose {
  constructor(options) {
    this._options = options;
  }

  /**
   * @param {string} services for which to run docker-compose up
   * @param {Object} options for docker-compose up
   * @return {ChildProcess} `docker-compose up` process
   */
  up(services, options) {
    // Merge options on top of default options.
    options = deepExtend({
      daemon: false,
      build: false,
      timeout: 10
    }, options);

    const args = ['up'];
    if (options.daemon) {
      args.push('-d');
    }
    if (options.build) {
      args.push('--build');
    }
    args.push('-t', `${options.timeout}`);
    if (services) {
      args.push(...services);
    }
    return this._run(args);
  }

  /**
   * @return {ChildProcess} `docker-compose down` process
   */
  down() {
    const args = ['down'];
    return this._run(args);
  }

  /**
   * @private
   * Start new docker-compose process.
   * @return {ChildProcess} newly started process
   */
  _run(commandArgs) {
    const composeArgs = [];
    if (this._options.file) {
      composeArgs.push('--file', this._options.file);
    }
    if (this._options.files) {
      this._options.files.forEach((file) => {
        composeArgs.push('--file', file);
      });
    }
    if (this._options.project) {
      composeArgs.push('--project-name', this._options.project);
    }
    console.log(`docker-compose`,...composeArgs, ...commandArgs);
    return child_process.spawn('docker-compose', composeArgs.concat(commandArgs));
  }
}

module.exports = DockerComposeFactory;
