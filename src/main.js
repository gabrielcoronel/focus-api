const express = require("express")
const morgan = require("morgan")
const bodyParser = require("body-parser")
const usersService = require("./services/usersService")
const tasksService = require("./services/tasksService")
const habitsService = require("./services/habitsService")

const app = express()

app.use(morgan("tiny"))
app.use(bodyParser.json())

app.use("/users_service", usersService)
app.use("/tasks_service", tasksService)
app.use("/habits_service", habitsService)

app.listen(8000)
