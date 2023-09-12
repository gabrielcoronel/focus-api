const express = require("express")
const database = require("../utilities/database")
const uuid4 = require("uuid4")

const service = express.Router()

service.post("/create", async (request, response) => {
  const { nickname, ...habit } = request.body
  const session = database.session()
  const query = `
    MATCH (u:User {nickname: $nickname})
    CREATE (u)-[:HAS]->(:Habit {
      title: $title,
      habitId: $habitId,
      description: $description,
      urgency: $urgency,
      importance: $importance,
      time: datetime($time),
      weekday: $weekday,
      category: $category,
      variant: $variant,
      lastCompletedDate: NULL,
      imageBytes: $imageBytes
    })
  `

  try {
    await session.run(query, {
      nickname,
      habitId: uuid4(),
      ...habit
    })

    session.close()
    
    response.sendStatus(200)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)
  }
})

service.post("/update", async (request, response) => {
  const { habitId, ...habit } = request.body
  const session = database.session()
  const query = `
    MATCH (h:Habit {habitId: $habitId})
    SET h += $habit
  `

  try {
    await session.run(query, {
      habitId,
      habit
    })

    session.close()

    response.sendStatus(200)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)
  }
})

service.post("/toggle_complete_habit", async (request, response) => {
  const { habitId } = request.body
  const session = database.session()
  const query = `
    MATCH (h:Habit {habitId: $habitId})
    SET h.lastCompletedDate = (
      CASE h.lastCompletedDate IS NULL
        WHEH TRUE THEN date()
        ELSE NULL
      END
    )
  `

  try {
    await session.run(query, {
      habitId
    })

    session.close()

    response.sendStatus(200)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)
  }
})

service.post("/get_by_id", async (request, response) => {
  const { habitId } = request.body
  const session = database.session()
  const query = `
    MATCH (h:Habit {habitId: $habitId})
    RETURN h
    LIMIT 1
  `

  try {
    const result = await session.run(query, {
      habitId
    })
    const [habit] = result.records

    session.close()

    response.json(habit)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)
  }
})

service.post("/delete", async (request, response) => {
  const { habitId } = request.body
  const session = database.session()
  const query = `
    MATCH (h:Habit {habitId: $habitId})
    DETACH DELETE h
  `

  try {
    await session.run(query, {
      habitId
    })

    session.close()

    response.sendStatus(200)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)
  }
})

service.post("/get_user_habits", async (request, response) => {
  const { nickname } = request.body
  const session = database.session()
  const query = `
    MATCH (h:Habit)-[:HAS]-(:User {nickname: $nickname})
    RETURN h
  `

  try {
    const result = await session.run(query, {
      nickname
    })
    const habits = result.records.map((r) => r.toObject())

    session.close()

    response.json(habits)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)
  }
})

service.post("/get_existent_categories", async (request, response) => {
  const { nickname } = request.body
  const session = database.session()
  const query = `
    MATCH (t:Task)-[:HAS]-(:User {nickname: $nickname})
    WHERE t.category IS NOT NULL
    RETURN DISTINCT t.category AS category
  `

  try {
    const result = await session.run(query, {
      nickname
    })
    const categories = result.records.map((r) => r.get("category"))

    session.close()

    response.json(categories)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)
  }
})

module.exports = service
