import { db } from '../client.ts'
import { argonPasswordHasher } from '../../../modules/identity/infra/password-hasher.ts'
import { credentials, users } from '../schema.ts'
import { newId } from '../../ids.ts'

const demoUser = {
  id: newId(),
  email: 'test@test.com',
  username: 'test',
  displayName: 'Demo User',
  bio: 'Welcome! This is the demo account.',
  location: 'Kathmandu, Nepal',
  password: 'testtest',
}

const demoUsers = Array.from({ length: 20 }, (_, index) => {
  const number = String(index + 1).padStart(2, '0')

  const profiles = [
    {
      bio: 'Building things for the web and exploring new technologies.',
      location: 'Kathmandu, Nepal',
    },
    {
      bio: 'Software developer interested in open source.',
      location: 'Pokhara, Nepal',
    },
    {
      bio: 'Sharing ideas, learning, and connecting with developers.',
      location: 'Lalitpur, Nepal',
    },
    {
      bio: 'Passionate about technology and creative problem solving.',
      location: 'Bhaktapur, Nepal',
    },
  ]

  return {
    id: newId(),
    email: `user${number}@example.com`,
    username: `user${number}`,
    displayName: `User ${number}`,
    bio: profiles[index % profiles.length]!.bio,
    location: profiles[index % profiles.length]!.location,
    password: 'password123',
  }
})

export async function seed(database: typeof db) {
  const demoPasswordHash = await argonPasswordHasher.hash(demoUser.password)
  const sharedPasswordHash = await argonPasswordHasher.hash('password123')

  const allUsers = [
    { ...demoUser, passwordHash: demoPasswordHash },
    ...demoUsers.map((user) => ({
      ...user,
      passwordHash: sharedPasswordHash,
    })),
  ]

  await database.transaction(async (tx) => {
    for (const user of allUsers) {
      const inserted = await tx
        .insert(users)
        .values({
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          bio: user.bio,
          location: user.location,
        })
        .onConflictDoNothing({
          target: users.email,
        })
        .returning({
          id: users.id,
        })

      const createdUser = inserted[0]

      if (!createdUser) continue

      await tx.insert(credentials).values({
        userId: createdUser.id,
        passwordHash: user.passwordHash,
      })
    }
  })
}
