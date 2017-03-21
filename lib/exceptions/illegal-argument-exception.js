class IllegalArgumentException extends TypeError {
  constructor(arg) {
    super(`${arg} must be defined`)
  }
}

module.exports = IllegalArgumentException
