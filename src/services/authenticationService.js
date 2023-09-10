const express = require("express")
const crypto = require("crypto")
const process = require("process")
const uuid4 = require("uuid4")
const emailValidator = require("email-validator")
const database = require("../utilities/database")

const service = express.Router()

const encrypt = (text) => {
  const secret = process.env.FOCUS_ENCRYPTION_KEY
  const cypher = crypto.createHmac("sha256", secret)

  cypher.update(text)

  const encrypted = cypher.digest("hex")

  return encrypted
}

const compareEncrypted = (encrypted, plain) => {
  const encryptedPlain = encrypt(plain)

  return encrypted === encryptedPlain
}

const storePlainAccountSignUpData = async (user, email, password) => {
  const session = database.session()
  const query = `
    CREATE (a:Account {accountType: "plain", accountId: $accountId})
    CREATE (:PlainAccount {email: $email, password: $password})-[:IS]-(a)
    CREATE (u:User {
      nickname: $nickname
      name: $name,
      firstSurname: $firstSurname,
      secondSurname: $secondSurname
    })
    CREATE (a)-[:IDENTIFIES]-(u)
  `

  const result = await session.run(query, {
    accountId: uuid4(),
    email,
    password: encrypt(password),
    ...user
  })

  session.close()

  return result
}

const retrievePlainAccountSignUpData = async (email) => {
  const session = database.session()
  const query = `
    MATCH (pa:PlainAccount {email: $email})-[:IS]-(:Account)-[:IDENTIFIES]-(u:User)
    RETURN
      pa AS plainAccount,
      u AS user
    LIMIT 1
  `

  const result = await session.run(query, {
    email
  })

  session.close()

  if (result.records === 0) {
    return null
  }

  const [record] = result.records
  const plainAccount = record.get("plainAccount")
  const user = record.get("user")
  const signUpData = {
    plainAccount,
    user
  }

  return signUpData
}

const isNicknameTaken = async (nickname) => {
  const session = database.session()
  const query = `
    OPTIONAL MATCH (u:User {nickname: $nickname})
    RETURN (
      CASE
      WHEN u IS NULL THEN FALSE
      ELSE TRUE
      END
    ) AS isTaken
    LIMIT 1
  `

  const result = await session.run(query, {
    nickname
  })

  session.close()

  const [record] = result.records
  const isTaken = record.get("isTaken")

  return isTaken
}

const createSession = async (nickname) => {
  const session = database.session()
  const query = `
    MATCH (u:User {nickname: $nickname})
    CREATE (s:Session {token: $token})-[:HOLDS]-(u)
    RETURN s AS session
  `

  const result = await session.run(query, {
    nickname,
    token: uuid4()
  })

  session.close()

  const [record] = result.records
  const token = record.get("token")
  const sessionData = {
    nickname,
    token
  }

  return sessionData
}

service.post("/sign_up_with_plain_account", async (request, response) => {
  const { user, email, password } = request.body
  
  if (!emailValidator.validate(email)) {
    response.status(400).send("INVALID_EMAIL")

    return
  }

  try {
    if (await isNicknameTaken(user.nickname)) {
      response.status(400).send("NICKNAME_TAKEN")

      return
    }
  } catch (error) {
    console.log(error)

    response.sendStatus(500)

    return
  }

  try {
    await storePlainAccountSignUpData(user, email, password)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)

    return
  }

  try {
    const sessionData = await createSession(user.nickname)

    response.json(sessionData)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)
  }
})

service.post("/sign_up_with_google_account", (request, response) => {
  // Pendiente
})

service.post("/sign_in_with_plain_account", async (request, response) => {
  const { email, password } = request.body

  let signUpData = null

  try {
    signUpData = await retrievePlainAccountSignUpData(email)

    if (signUpData === null) {
      response.status(400).send("INVALID_CREDENTIALS")

      return
    }
  } catch (error) {
    console.log(error)

    response.sendStatus(500)

    return
  }

  if (!compareEncrypted(signUpData.plainAccount.password, password)) {
    response.status(400).send("INVALID_CREDENTIALS")

    return
  }

  try {
    const sessionData = await createSession(signUpData.user.nickname)

    response.json(sessionData)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)
  }
})

service.post("/sign_in_with_google_account", (request, response) => {
  // Pendiente
})

service.post("/sign_out", async (request, response) => {
  const { token } = request.body
  const session = database.session()
  const query = `
    MATCH (s:Session {token: $token})
    DETACH DELETE s
  `

  try {
    await session.run(query, {
      token
    })

    session.close()

    response.sendStatus(200)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)
  }
})

module.exports = service
