const express = require("express")
const database = require("../utilities/database")
const uuid4 = require("uuid4")

const service = express.Router()

service.post("/create", async (request, response) => {
  const { nickname, ...task } = request.body
  const session = database.session()
  const query = `
    MATCH (u:User {nickname: $nickname})
    CREATE (u)-[:HAS]->(:Task {
      title: $title,
      taskId: $taskId,
      description: $description,
      urgency: $urgency,
      importance: $importance,
      date: date($date),
      time: datetime($time),
      category: $category,
      completed: FALSE,
      imageBytes: $imageBytes
    })
  `

  try {
    await session.run(query, {
      nickname,
      taskId: uuid4(),
      ...task
    })

    session.close()
    
    response.sendStatus(200)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)
  }
})

service.post("/update", async (request, response) => {
  const { taskId, ...task } = request.body
  const session = database.session()
  const query = `
    MATCH (t:Task {taskId: $taskId})
    SET t += $task
  `

  try {
    await session.run(query, {
      taskId,
      task
    })

    session.close()

    response.sendStatus(200)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)
  }
})

service.post("/toggle_complete_task", async (request, response) => {
  const { taskId } = request.body
  const session = database.session()
  const query = `
    MATCH (t:Task {taskId: $taskId})
    SET t.completed = (NOT t.completed)
  `

  try {
    await session.run(query, {
      taskId
    })

    session.close()

    response.sendStatus(200)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)
  }
})

service.post("/get_by_id", async (request, response) => {
  const { taskId } = request.body
  const session = database.session()
  const query = `
    MATCH (t:Task {taskId: $taskId})
    RETURN t
    LIMIT 1
  `

  try {
    const result = await session.run(query, {
      taskId
    })
    const [task] = result.records

    session.close()

    response.json(task)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)
  }
})

service.post("/delete", async (request, response) => {
  const { taskId } = request.body
  const session = database.session()
  const query = `
    MATCH (t:Task {taskId: $taskId})
    DETACH DELETE t
  `

  try {
    await session.run(query, {
      taskId
    })

    session.close()

    response.sendStatus(200)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)
  }
})

service.post("/get_user_tasks", async (request, response) => {
  const { nickname } = request.body
  const session = database.session()
  const query = `
    MATCH (t:Task)-[:HAS]-(:User {nickname: $nickname})
    RETURN t
  `

  try {
    const result = await session.run(query, {
      nickname
    })
    const tasks = result.records.map((r) => r.toObject())

    session.close()

    response.json(tasks)
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
    const categories = result.records.map((r) => r.get("category"))

    session.close()

    response.json(categories)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)
  }
})

module.exports = service