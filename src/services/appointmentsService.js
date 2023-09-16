const express = require("express")
const nodemailer = require("nodemailer")
const uuid4 = require("uuid4")
const process = require("process")
const database = require("../utilities/database")
const { neo4jDateTimeToString, ISODateToNeo4jDateTime } = require("../utilities/neo4j")
require("dotenv").config()

const service = express.Router()

const storeAppointment = async (nickname, appointment) => {
  const session = database.session()
  const query = `
    MATCH (u:User {nickname: $nickname})
    CREATE (:Appointment {
      appointmentId: $appointmentId,
      datetime: datetime($datetime),
      description: $description
    })-[:BOOKS]->(u)
  `

  await session.run(query, {
    appointmentId: uuid4(),
    nickname,
    datetime: ISODateToNeo4jDateTime(appointment.datetime),
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

/**
  * Agenda una nueva cita por correo y la almacena en el registro de la base
  * de datos
  *
  * Esquema del cuerpo de la respuesta
  *
  * `
  *   nickname: string, // nombre de usuario del usuario actual
  *   appointment: Appointment // datos de la cita
  * `
  */
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

/**
  * Obtiene la lista de citas pendientes para el usuario. En este contexto,
  * pendiente significa agendada para fechas futuras a la actual con un margen
  * de espera de 30 minutos.
  *
  * Esquema del cuerpo de la solicitud
  *
  * `
  *   nickname: string // nombre de usuario del usuario
  * `
  *
  * Esquema del cuerpo de la respuesta: [Appointment]
  */
service.post("/get_pending_appointments", async (request, response) => {
  const { nickname } = request.body
  const session = database.session()
  const query = `
    MATCH (a:Appointment)-[:BOOKS]-(:User {nickname: $nickname})
    WHERE a.datetime >= datetime() - Duration({minutes: 30})
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
        datetime: neo4jDateTimeToString(field.datetime),
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
