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
