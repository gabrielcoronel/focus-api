const express = require("express")
const cors = require("cors");
const morgan = require("morgan")
const bodyParser = require("body-parser")
const usersService = require("./services/usersService")
const tasksService = require("./services/tasksService")
const habitsService = require("./services/habitsService")
const appointmentsService = require("./services/appointmentsService")
const spotifyService = require("./services/spotifyService")

const app = express()

app.use(morgan("tiny"))
app.use(bodyParser.json())

// Configura CORS para permitir solicitudes desde cualquier origen
app.use(cors({
    origin: "http://localhost:3000", // Cambiar según la direccion de la App
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true
}));

app.use("/users_service", usersService)
app.use("/tasks_service", tasksService)
app.use("/habits_service", habitsService)
app.use("/appointments_service", appointmentsService)
app.use("/spotify_service", spotifyService)

app.listen(8000)
