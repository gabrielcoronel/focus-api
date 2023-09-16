const express = require("express")
const database = require("../utilities/database")
const uuid4 = require("uuid4")
const { neo4jDateTimeToString, ISODateToNeo4jDateTime } = require("../utilities/neo4j")

const service = express.Router()

service.post("/create", async (request, response) => {
  const { nickname, habit } = request.body
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
      ...habit,
      time: ISODateToNeo4jDateTime(habit.time)
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
      habit: {
        ...habit,
        time: ISODateToNeo4jDateTime(habit.time)
      }
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
    WITH h,
    CASE WHEN h.lastCompletedDate IS NULL THEN date() ELSE NULL END AS newLastCompletedDate
    SET h.lastCompletedDate = newLastCompletedDate
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
    RETURN h AS habit
    LIMIT 1
  `

  try {
    const result = await session.run(query, {
      habitId
    })

    session.close()

    const [record] = result.records
    const field = record.get("habit").properties
    const habit = {
      ...field,
      time: neo4jDateTimeToString(field.time),
      lastCompletedDate: (
        field.lastCompletedDate ?
        neo4jDateTimeToString(field.lastCompletedDate) :
        null
      )
    }

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
    RETURN h AS habits
  `

  try {
    const result = await session.run(query, {
      nickname
    })

    session.close()

    const habits = result.records.map((record) => {
      const field = record.get("habits").properties
      const habit = {
        ...field,
        time: neo4jDateTimeToString(field.time),
        lastCompletedDate: (
          field.lastCompletedDate ?
          neo4jDateTimeToString(field.lastCompletedDate) :
          null
        )
      }

      return habit
    })

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
    MATCH (h:Habit)-[:HAS]-(:User {nickname: $nickname})
    WHERE h.category IS NOT NULL
    RETURN DISTINCT h.category AS category
  `

  try {
    const result = await session.run(query, {
      nickname
    })

    session.close()

    const categories = result.records.map((record) => {
      const category = record.get("category")

      return category
    })

    response.json(categories)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)
  }
})

module.exports = service
