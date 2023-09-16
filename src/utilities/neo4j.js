const neo4j = require("neo4j-driver")

const readDateTimeProperty = (property) => {
  if (property === null || property === undefined) {
    return 0
  }

  return property.toInt()
}

const neo4jDateTimeToString = (neo4jDateTime) => {
  const { year, month, day, hour, minute, second, nanosecond } = neo4jDateTime
  const date = new Date(
    readDateTimeProperty(year),
    readDateTimeProperty(month) - 1,
    readDateTimeProperty(day),
    readDateTimeProperty(hour),
    readDateTimeProperty(minute),
    readDateTimeProperty(second),
    readDateTimeProperty(nanosecond) / 1000000
  )
  const string = date.toISOString()

  return string
}

const ISODateToNeo4jDateTime = (ISODate) => {
  const date = new Date(ISODate)
  const neo4jDateTime = neo4j.DateTime.fromStandardDate(date)

  return neo4jDateTime
}

module.exports = {
  neo4jDateTimeToString,
  ISODateToNeo4jDateTime
}
