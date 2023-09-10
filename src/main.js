const express = require("express")
const morgan = require("morgan")
const bodyParser = require("body-parser")
const tasksService = require("./services/tasksService")

const app = express()

app.use(morgan("tiny"))
app.use(bodyParser.json())

app.use("/tasks_service", tasksService)

app.listen(8000)
