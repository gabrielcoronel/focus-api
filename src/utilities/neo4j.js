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

module.exports = {
  neo4jDateTimeToString
}
