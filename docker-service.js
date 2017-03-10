const DockerComposeFactory = require('./docker-compose');

function DockerServiceFactory(options) {
  return new DockerService(options);
}

class DockerService {
  constructor(options) {
    if (!options.name) throw new Error('Service name is required');
    this.name = options.name;
    this.dockerCompose = DockerComposeFactory(options);
    this.fork = null;
    this.busy = false;
  }

  /**
   * Kill `docker-compose up` child process and start a new one.
   */
  restart() {
    if (this.busy) {
      console.log('Already trying to restart service');
      return;
    }
    if (this.fork) {
      this.busy = true;
      this.fork.once('exit', (code) => {
        console.log(`service has stopped [exit code ${code}]: ${this.name}`);
        this.start();
        this.busy = false;
      });
      this.fork.kill();
    } else {
      this.start();
    }
  }

  /**
   * Run `docker-compose up` and hold on to child process.
   */
  start() {
    this.fork = this.dockerCompose.up([this.name], {
      build: true,
      timeout: 0
    });
    this.fork.stdout.on('data', (data) => process.stdout.write(data));
    this.fork.stderr.on('data', (data) => process.stderr.write(data));
  }
}

module.exports = DockerServiceFactory;
