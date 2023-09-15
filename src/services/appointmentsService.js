const express = require("express")
const neo4j = require("neo4j-driver")
const nodemailer = require("nodemailer")
const uuid4 = require("uuid4")
const process = require("process")
const database = require("../utilities/database")
const { neo4jDateTimeToString } = require("../utilities/neo4j")
require("dotenv").config()

const service = express.Router()

const storeAppointment = async (nickname, appointment) => {
  const session = database.session()
  const query = `
    MATCH (u:User {nickname: $nickname})
    CREATE (:Appointment {
      appointmentId: $appointmentId,
      date: date($date),
      time: datetime($time),
      description: $description
    })-[:BOOKS]->(u)
  `

  await session.run(query, {
    appointmentId: uuid4(),
    nickname,
    date: neo4j.DateTime.fromStandardDate(new Date(appointment.date)),
    time: neo4j.DateTime.fromStandardDate(new Date(appointment.time)),
    description: appointment.description
  })

  session.close()
}

const bookAppointment = async (nickname, appointment) => {
  const transporter = nodemailer.createTransport({
    host: "smtp-relay.sendinblue.com",
    port: 587,
    secureConnection: false,
    auth: {
      user: process.env.FOCUS_APPOINTMENT_BOOKER_EMAIL,
      pass: process.env.FOCUS_APPOINTMENT_BOOKER_PASSWORD
    },
    tls: {
        ciphers:'SSLv3'
    }
  })

  const result = await transporter.sendMail({
    from: `"Sistema de agendado de citas de Focus" ${process.env.FOCUS_APPOINTMENT_BOOKER_EMAIL}`,
    to: process.env.FOCUS_SPECIALIST_EMAIL,
    subject: "Hola",
    text: "Texto de prueba",
  })

  return result
}

service.post("/create", async (request, response) => {
  const { nickname, appointment } = request.body

  try {
    await bookAppointment(nickname, appointment)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)

    return
  }

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
    WHERE a.date >= date()
    AND a.time >= datetime() - Duration({minutes: 30})
    RETURN a AS appointments
  `

  try {
    const result = await session.run(query, {
      nickname
    })
    const appointments = result.records.map((record) => {
      const field = record.get("appointments").properties
      const appointment = {
        ...field,
        date: neo4jDateTimeToString(field.date),
        time: neo4jDateTimeToString(field.time)
      }

      return appointment
    })

    session.close()

    response.json(appointments)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)
  }
})

module.exports = service
