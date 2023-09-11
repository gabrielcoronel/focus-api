const express = require("express")
const uuid4 = require("uuid4")
const database = require("../utilities/database")

const service = express.Router()

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

const storeUser = async (user) => {
  const session = database.session()
  const query = `
    CREATE (:User {
      nickname: $nickname,
      name: $name,
      firstSurname: $firstSurname,
      secondSurname: $secondSurname,
      grade: $grade,
      class: $class,
      studentIdentifier: $studentIdentifier
    })
  `

  await session.run(query, {
    ...user
  })

  session.close()
}

service.post("/create", async (request, response) => {
  const { user } = request.body

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
    await storeUser(user)

    response.sendStatus(200)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)
  }
})

service.post("/update", async (request, response) => {
  const { nickname, ...user } = request.body
  const session = database.session()
  const query = `
    MATCH (u:User {nickname: $nickname})
    SET u += $user
  `

  try {
    await session.run(query, {
      nickname,
      user
    })
    
    session.close()

    response.sendStatus(200)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)
  }
})

service.post("/set_theme", async (request, response) => {
  const { nickname, ...theme } = request.body
  const session = database.session()
  const query = `
    MATCH (u:User {nickname: $nickname})
    MERGE (t:Theme)-[:CUSTOMIZES]-(u)
    ON CREATE SET t = $newTheme
    ON MATCH SET t += $updatedTheme
  `

  try {
    await session.run(query, {
      nickname,
      newTheme: {
        themeId: uuid4(),
        ...theme
      },
      updatedTheme: theme
    })

    session.close()

    response.sendStatus(200)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)
  }
})

service.post("/get_by_nickname", async (request, response) => {
  const { nickname } = request.body
  const session = database.session()
  const query = `
    MATCH (u:User {nickname: $nickname})
    OPTIONAL MATCH (t:Theme)-[:CUSTOMIZES]-(u)
    RETURN
      u AS user,
      t AS theme
    LIMIT 1
  `

  try {
    const result = await session.run(query, {
      nickname
    })
    const [record] = result.records
    const user = record.get("user")
    const theme = record.get("theme")
    const responsePayload = {
      ...user,
      theme
    }

    response.json(responsePayload)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)
  }
})

module.exports = service
