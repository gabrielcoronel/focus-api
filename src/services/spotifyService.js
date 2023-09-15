const express = require("express")
const axios = require("axios")
const neo4j = require("neo4j-driver")
const process = require("process")
const { Buffer } = require("buffer")
const database = require("../utilities/database")

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
    redirect_uri: "/spotify_service/login_webhook",
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
    })-[:AUTHORIZES]-(u)
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

  const [record] = result.records
  const authorization = record.get("authorization")

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
  expiredDate,
  refreshToken,
  nickname
) => {
  const session = database.session()
  const query = `
    MATCH (sa:SpotifyAuthorization)-[:AUTHORIZES]-(:User {nickname: $nickname})
    SET sa = $newSpotifyAuthorization
  `

  await session.run(query, {
    nickname,
    newSpotifyAuthorization: {
      accessToken,
      expiredDate,
      refreshToken
    }
  })

  session.close()
}

service.post("/get_login_url", (request, response) => {
  const { nickname } = request.body
  const queryParameters = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: "streaming user-read-email user-read-private",
    redirect_url: "/spotify_service/login_webhook",
    state: { nickname }
  })

  const loginUrl =
    `https://accounts.spotify.com/authorize/?${queryParameters.toString()}`

  response.json(loginUrl)
})

service.post("/login_webhook", async (request, response) => {
  const { code, state } = request.body
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
      state.nickname
    )

    response.sendStatus(200)
  } catch (error) {
    console.log(error)

    response.sendStatus(500)
  }
})

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
