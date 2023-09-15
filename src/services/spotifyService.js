const express = require("express")
const process = require("process")
const database = require("../utilities/database")

const service = express.Router()

service.post("/get_login_url", (_, response) => {
  const queryParameters = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: "streaming user-read-email user-read-private",
    redirect_url: "/spotify_service/login_webhook"
  })

  const loginUrl =
    `https://accounts.spotify.com/authorize/?${queryParameters.toString()}`

  response.json(loginUrl)
})

service.post("/login_webhook", (request, response) => {
})

service.post("/get_access_token", (request, response) => {
})

module.exports = service
