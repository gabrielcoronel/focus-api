const neo4j = require("neo4j-driver")
const process = require("process")
require("dotenv").config()

const driver = neo4j.driver(
  process.env.NEO4J_CONNECTION_URL,
  neo4j.auth.basic(
    process.env.NEO4J_USER,
    process.env.NEO4J_PASSWORD
  )
)

process.on("exit", (_) => {
  driver.close()
})

module.exports = driver
