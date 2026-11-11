import type { Invalid } from './user.ts'

export class EmailTaken extends Error {
  constructor() {
    super('Email is already taken')
    this.name = 'EmailTaken'
  }
}

export class UsernameTaken extends Error {
  constructor() {
    super('Username is already taken')
    this.name = 'UsernameTaken'
  }
}

export class ValidationFailed extends Error {
  constructor(readonly errors: Invalid[]) {
    super('Validation failed')
    this.name = 'ValidationFailed'
  }
}

export class InvalidCredentials extends Error {
  constructor() {
    super('Email or password is incorrect')
    this.name = 'InvalidCredentials'
  }
}

export class NotAuthorized extends Error {
  constructor() {
    super('Missing or invalid access token')
    this.name = 'NotAuthorized'
  }
}

export class InvalidRefreshToken extends Error {
  constructor() {
    super('Invalid refresh token')
    this.name = 'InvalidRefreshToken'
  }
}
