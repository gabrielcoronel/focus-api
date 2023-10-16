const express = require("express")
const database = require("../utilities/database")
const uuid4 = require("uuid4")
const { neo4jDateTimeToString, ISODateToNeo4jDateTime } = require("../utilities/neo4j")

const service = express.Router()

/**
  * Crea un nuevo hábito para un usuario
  *
  * Esquema del cuerpo de la solicitud
  *
  * `
  *   nickname: string, // el nombre usuario
  *   habit: Habit // datos del hábito
  * `
  */
service.post("/create", async (request, response) => {
  const { firebaseAuthenticationId, habit } = request.body
  const session = database.session()
  const query = `
    MATCH (u:User {firebaseAuthenticationId: $firebaseAuthenticationId})
    CREATE (u)-[:HAS]->(:Habit {
      title: $title,
      habitId: $habitId,
      description: $description,
      urgency: $urgency,
      time: datetime($time),
      weekday: $weekday,
      category: $category,
      lastCompletedDate: NULL,
    })
  `

  try {
    await session.run(query, {
      firebaseAuthenticationId,
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

/**
  * Actualiza la información de un hábito
  *
  * Esquema del cuerpo de la solicitud
  *
  * `
  *   habitId: string, // ID del hábito
  *   ...habit: Habit // nuevos datos del hábito
  * `
  */
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

/**
  * Marca o desmarca un hábito como completado
  *
  * Esquema del cuerpo de la solicitud
  *
  * `
  *   habitId: string
  * `
  */
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

/**
  * Obtiene la información de un hábito con base a su ID
  *
  * Esquema del cuerpo de la solicitud
  *
  * `
  *   habitId: string, // El ID del hábito a obtener
  * `
  *
  * Esquema del cuerpo de la respuesta: Habit
  */
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

/**
  * Elimina un hábito
  *
  * Esquema del cuerpo de la solicitud
  *
  * `
  *   habitId: string, // ID del hábito
  * `
  */
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

/**
  * Obtiene la lista de hábitos de un usuario
  *
  * Esquema del cuerpo de la solicitud
  *
  * `
  *   nickname: string, // nombre de usuario del usuario
  * `
  *
  * Esquema del cuerpo de la respuesta: [Habit]
  */
service.post("/get_user_habits", async (request, response) => {
  const { firebaseAuthenticationId } = request.body
  const session = database.session()
  const query = `
    MATCH (h:Habit)-[:HAS]-(:User {firebaseAuthenticationId: $firebaseAuthenticationId})
    RETURN h AS habits
  `

  try {
    const result = await session.run(query, {
      firebaseAuthenticationId
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

/**
  * Obtiene la lista de categorías ya registradas, esto es conveniente para
  * proporcionar autocompletado en el formulario para crear un nuevo hábito
  *
  * Esquema del cuerpo de la solicitud
  *
  * `
  *   nickname: string, // nombre de usuario del usuario actual
  * `
  *
  * Esquema del cuerpo de la respuesta: [string]
  */
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
