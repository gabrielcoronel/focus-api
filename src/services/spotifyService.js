const express = require("express")
const axios = require("axios")
const neo4j = require("neo4j-driver")
const process = require("process")
const { Buffer } = require("buffer")
const database = require("../utilities/database")
require("dotenv").config()

/*
  * INSTRUCCIONES GENERALES DEL USO DEL SERVICIO
  * Este servicio provee acceso a todos los pasos del flujo de autenticación
  * con Spotify, leer la documentación de cada endpoint detalladamente
  *
  * Se puede pensar en el flujo de autorización como dos estados:
  * 1. Autorizado (A)
  * 2. No autorizado (NA)
  *
  * Entonces, el flujo de autorización consiste en pasar un usuario de NA a A,
  * y obtener su token de acceso para realizar operaciones con la API de Spotify
  * Ya que solo si el usuario está A, va a tener acceso a la funcionalidad de
  * Spotify mediante su token de acceso.
  *
  * 1. Solicitar el url del login ("get_login_url"): Al enviar una solicitud al
  * endpoint respectivo se devuelve una url, es responsabilidad del frontend
  * redireccionar al usuario a esta url. Esta url dirige a la pantalla donde
  * el usuario autoriza a FOCUS a usar Spotify. Esto causa que el esté A
  *
  * 1.5 LoginWebhook: Después de la autorización se ejecuta un Webhook que
  * es únicamente de relevancia interna
  *
  * 2. Obtener el token de acceso: Una vez autorizado el usuario y el webhook
  * ejecuta, "get_access_token" ofrece el token de acceso del usuario. El
  * frontend debe consumir el endpoint para obtener el token de acceso para
  * después usar las APIs de Spotify. Este endpoint se puede consumir cuantas
  * veces se desee una vez que el usuario esté autorizado. Entonces el usuario
  * podría autorizar el uso de Spotify la primera vez que abre la aplicación y
  * el frontend solo obtendría su token de acceso (refrescado) la próxima veces
  * que lo ocupe
  *
  * Esto constituye todo el flujo de autorización
  *
  * PREGUNTAS FRECUENTES:
  *
  * 1. ¿Cómo hago para saber si el usuario está A la primera vez?
  *   "get_access_token" devuelve 'null' si el usuario no está A, por lo tanto,
  *   se puede usar como una bandera para determinar esto.
  *
  * 2. ¿Qué pasa si el usuario ya no quiere darle acceso a FOCUS a su cuenta
  *   de Spotify?
  *   "delete" elimina la información de autorización de la base de datos,
  *   teniendo este efecto. Es responsabilidad del frontend ofrecer al usuario
  *   una interfaz para acceder a esta funcionalidad y informar al usuario sobre
  *   que tiene derecho de ser NA cuando el/ella quiera.
*/

const service = express.Router()

const getLoginWebhookData = async (authorizationCode) => {
  const authorizationHeader = `Basic ${Buffer.from(
    process.env.SPOTIFY_CLIENT_ID + ":" + process.env.SPOTIFY_CLIENT_SECRET
  ).toString("base64")}`
  const headers = {
    'Authorization': authorizationHeader,
    'Content-Type' : 'application/x-www-form-urlencoded'
  }
  const payload = {
    code: authorizationCode,
    redirect_uri: `${process.env.FOCUS_HOSTING_URL}/spotify_service/login_webhook`,
    grant_type: 'authorization_code'
  }
  const url = "https://accounts.spotify.com/api/token"

  const { data } = await axios.post(url, payload, { headers })

  return data
}

const getAccessTokenExpireDate = (expireTime) => {
  const expireDate = new Date()
  const newSeconds = expireDate.getSeconds() + expireTime

  expireDate.setSeconds(newSeconds)

  return expireDate
}

const storeSpotifyAuthorization = async (
  accessToken,
  expireDate,
  refreshToken,
  nickname
) => {
  const session = database.session()
  const query = `
    MATCH (u:User {nickname: $nickname})
    CREATE (:SpotifyAuthorization {
      accessToken: $accessToken,
      expireDate: $expireDate,
      refreshToken: $refreshToken
    })-[:AUTHORIZES]->(u)
  `
  const storedExpireDate = neo4j.DateTime.fromStandardDate(expireDate)

  await session.run(query, {
    nickname,
    accessToken,
    expireDate: storedExpireDate,
    refreshToken
  })

  session.close()
}

const getCurrentAuthorization = async (nickname) => {
  const session = database.session()
  const query = `
    MATCH (sa:SpotifyAuthorization)-[:AUTHORIZES]-(:User {nickname: $nickname})
    RETURN sa as authorization
    LIMIT 1
  `

  const result = await session.run(query, {
    nickname
  })

  if (result.records.length === 0) {
    return null
  }

  const [record] = result.records
  const authorization = record.get("authorization").properties

  return authorization
}

const isAuthorizationValid = (authorization) => {
  const expireDate = authorization.expireDate.toStandardDate()
  const currentDate = new Date()

  const isValid = currentDate.getTime() < expireDate.getTime()

  return isValid
}

const getRefreshData = async (authorization) => {
  const authorizationHeader = `Basic ${Buffer.from(
    process.env.SPOTIFY_CLIENT_ID + ":" + process.env.SPOTIFY_CLIENT_SECRET
  ).toString("base64")}`
  const headers = {
    'Authorization': authorizationHeader,
    'Content-Type' : 'application/x-www-form-urlencoded'
  }
  const payload = {
    refresh_token: authorization.refreshToken,
    grant_type: 'refresh_token'
  }
  const url = "https://accounts.spotify.com/api/token"

  const { data } = await axios.post(url, payload, { headers })

  return data
}

const updateSpotifyAuthorization = async (
  accessToken,
  expireDate,
  refreshToken,
  nickname
) => {
  const session = database.session()
  const query = `
    MATCH (sa:SpotifyAuthorization)-[:AUTHORIZES]-(:User {nickname: $nickname})
    SET sa = $newSpotifyAuthorization
  `

  const storedExpireDate = neo4j.DateTime.fromStandardDate(expireDate)

  await session.run(query, {
    nickname,
    newSpotifyAuthorization: {
      accessToken,
      expireDate: storedExpireDate,
      refreshToken
    }
  })

  session.close()
}

/**
  * Obtiene la URL para redireccionar al usuario a la pantalla de autorización
  * de Spotify. Después de esto, se ejectura el Webhook respectivo ("login_webhook").
  * Este endpoint se tiene que usar antes de permitirle al usuario usar la
  * funcionalidad de Spotify
  *
  * Esquema del cuerpo de la solicitud
  *
  * `
  *   nickname: string // nombre de usuario del usuario
  * `
  *
  * Esquema del cuerpo de la respuesta: string
  */
service.post("/get_login_url", (request, response) => {
  const { nickname } = request.body
  const queryParameters = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: "streaming user-read-email user-read-private",
    redirect_uri: `${process.env.FOCUS_HOSTING_URL}/spotify_service/login_webhook`,
    state: nickname
  })

  const loginUrl =
    `https://accounts.spotify.com/authorize/?${queryParameters.toString()}`

  response.json(loginUrl)
})

/**
  * Webhook que se ejecuta después de que el usuario autoriza a la aplicación
  * a acceder a su cuenta de Spotify. El webhook obtiene un token de acceso
  * y lo almacena en la base de datos junto con su fecha de expiración
  * (necesario para luego refrescarlo) y su token de refrescado
  *
  * Como no es un endpoint pensado a consumir por un cliente normal, no se
  * documenta la estructura del cuerpo de su solicitud de ningún tipo
  */
service.get("/login_webhook", async (request, response) => {
  const { code } = request.query
  const nickname = request.query.state

  let webhookData = null

  try {
    webhookData = await getLoginWebhookData(code)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)

    return
  }

  const accessToken = webhookData.access_token
  const refreshToken = webhookData.refresh_token
  const expireDate = getAccessTokenExpireDate(webhookData.expires_in)

  try {
    await storeSpotifyAuthorization(
      accessToken,
      expireDate,
      refreshToken,
      nickname
    )

    response.sendStatus(200)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)
  }
})

/**
  * Obtiene el token de acceso del usuario, lo que permite acceder a la
  * funcionalidad de Spotify. Este endpoint se encarga de refrescar el token
  * de ser necesario, entonces una vez el frontend sepa que el usuario autorizó
  * el uso de Spotify (ver "get_login_url"), puede consumir este endpoint
  * sin preocuparse de refrescarlo. Este endpoint está pensado en usarse
  * estrictamente después de que el usuario haya autorizado el uso de Spotify,
  * no antes. Es necesario que el frontend cumpla con esta condición, asegurandose
  * de usar "get_login_url" antes de este endpoint.
  *
  * Sin embargo, este endpoint se puede también utilizar como una bandera para
  * saber si el usuario autorizó el uso de Spotify. Si este endpoint da como
  * respuesta 'null', se puede garantizar que el usuario no ha autorizado el
  * uso de Spotify aún
  *
  * Esquema del cuerpo de la solicitud
  *
  * `
  *   nickname: string // nombre de usuario del usuario
  * `
  *
  * Esquema del cuerpo de la respuesta 
  *
  * `
  *   accessToken: string // el token de acceso
  * `
  *
  * O bien
  *
  * 'null' // Si el usuario no ha autorizado el uso de Spotify
  */
service.post("/get_access_token", async (request, response) => {
  const { nickname } = request.body
  let currentAuthorization = null

  try {
    currentAuthorization = await getCurrentAuthorization(nickname)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)

    return
  }

  if (currentAuthorization === null) {
    response.json(null)

    return
  }

  if (isAuthorizationValid(currentAuthorization)) {
    response.json({
      accessToken: currentAuthorization.accessToken
    })

    return
  }

  let refreshData = null

  try {
    refreshData = await getRefreshData(currentAuthorization)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)

    return
  }

  const newAccessToken = refreshData.access_token
  const newRefreshToken = refreshData.refresh_token
  const newExpireDate = getAccessTokenExpireDate(refreshData.expires_in)

  try {
    await updateSpotifyAuthorization(
      newAccessToken,
      newExpireDate,
      newRefreshToken,
      nickname
    )
  } catch (error) {
    console.log(error)

    response.sendStatus(500)

    return
  }

  response.json({
    accessToken: newAccessToken
  })
})

/**
  * Elimina la información de autorización de Spotify de un usuario. Esto sirve
  * para cuando el usuario ya no quiere darle acceso a Focus de Spotify. En
  * consecuencia, ya el usuario no tendría acceso a la funcionalidad de Spotify
  * de Focus hasta que vuelva a autorizar la aplicación con "get_login_url".
  *
  * Esquema del cuerpo de la solicitud
  *
  * `
  *   nickname: string // nombre de usuario del usuario
  * `
  */
service.post("/delete", async (request, response) => {
  const { nickname } = request.body
  const session = database.session()
  const query = `
    MATCH (sa:SpotifyAuthorization)-[:AUTHORIZES]-(:User {nickname: $nickname})
    DETACH DELETE sa
  `

  try {
    await session.run(query, {
      nickname
    })

    session.close()

    response.sendStatus(200)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)
  }
})

module.exports = service
