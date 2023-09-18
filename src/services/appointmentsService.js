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

const getUser = async (nickname) => {
  const session = database.session()
  const query = `
    MATCH (u:User {nickname: $nickname})
    RETURN u AS user
    LIMIT 1
  `

  const result = await session.run(query, {
    nickname
  })

  session.close()

  const [record] = result.records
  const user = record.get("user").properties

  return user
}

const formatAppointmentEmailHtmlString = (user, appointment) => {
  const { studentIdentifier } = user
  const { description } = appointment
  const datetime = new Date(appointment.datetime)
  const htmlString = `
    <body style="font-family: Arial, sans-serif; background-color: #18072B; margin: 0; padding: 0;">
        <header style="background-image: linear-gradient(to right,#8C52FF, #FF66CA); border-radius: 0px 0px 20px 20px; text-align: center; padding: 20px 0;">
            <h1 style="font-size: 40px; color: #ffffff">FOCUS APP</h1>
        </header>
        <div style="padding: 20px">
            <table width="100%" border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center">
                  <div style="width: 400px; height: auto; margin: 20px; padding: 20px; background-color: #FFF; border-radius: 5px; box-shadow: 0 4px 8px 0 rgba(255, 0, 242, 0.2), 0 6px 20px 0 rgba(255, 0, 242, 0.2);">
                      <h1 style="color: #8C52FF; text-align: center;">Nueva Cita FOCUS APP</h1>
                      <p style="text-align: center; color: #18072B;">Detalles de la cita:</p>
                      <ul style="list-style: none;">
                          <li align="left">Carnet: ${studentIdentifier}</li>
                          <li align="left">Hora: ${datetime.getHours().toString().padStart(2, "0")}:${datetime.getMinutes().toString().padStart(2, "0")}</li>
                          <li align="left">Día: ${datetime.getDate()}/${datetime.getMonth() + 1}/${datetime.getFullYear()}</li>
                          <li align="left">Descripción: ${description}</li>
                      </ul>
                  </div>
                </td>
              </tr>
            </table>
        </div>
        <footer style="box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.2), 0 6px 20px 0 rgba(0, 0, 0, 0.19); background-image: linear-gradient(to right,#8C52FF, #FF66CA); color: #FFF; text-align: center; padding: 10px 0;">
            <br>
            &copy; FocusApp
            <p>Cedes Don Bosco</p>
        </footer>
    </body>
  `

  return htmlString
}

const formatAppointmentSubject = (user) => {
  const { name, firstSurname, secondSurname } = user
  const subject = `Cite agendada por FOCUS APP para ${name} ${firstSurname} ${secondSurname}`

  return subject
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

  const user = await getUser(nickname)

  const result = await transporter.sendMail({
    from: `"Sistema de agendado de citas de Focus" ${process.env.FOCUS_APPOINTMENT_BOOKER_EMAIL}`,
    to: process.env.FOCUS_SPECIALIST_EMAIL,
    subject: formatAppointmentSubject(user),
    html: formatAppointmentEmailHtmlString(user, appointment)
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
