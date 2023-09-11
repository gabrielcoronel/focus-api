const express = require("express")
const uuid4 = require("uuid4")
const database = require("../utilities/database")

const service = express.Router()

const storeAppointment = async (nickname, appointment) => {
  const session = database.session()
  const query = `
    MATCH (u:User {nickname: $nickname})
    CREATE (:Appointment {
      appointmentId: $appointmentId
    })-[:BOOKS]-(u)
  `

  await session.run(query, {
    appointmentId: uuid4(),
    nickname,
    ...appointment
  })

  session.close()
}

const bookAppointment = async () => {
}

service.post("/create", async (request, response) => {
  const { nickname, appointment } = request.body

  try {
    await storeAppointment(nickname, appointment)
    response.sendStatus(200)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)
  }
})

service.post("/get_pending_appointments", async (request, response) => {
  const { nickname } = request.body
  const session = database.session()
  const query = `
    MATCH (a:Appointment)-[:BOOKS]-(:User {nickname: $nickname})
    RETURN a AS appointments
  `

  try {
    const result = await session.run(query, {
      nickname
    })
    const appointments = result.records.map((r) => r.get("appointments"))

    session.close()

    response.json(appointments)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)
  }
})

module.exports = service
