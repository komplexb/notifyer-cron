/**
 * Table Details
 * @user {String} primary key
 * @cache {String} cache store contents
 * @onenote {String} local storage contents
 * @onenote_section_count {String} local storage contents
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb')

const client = new DynamoDBClient({
  region: process.env.REGION
})

const documentClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true
  }
})

/**
 * Instead of purpose written methods for each attribute, this generic wrapper
 * uses the itemName to generate the appropriate `get` syntax.
 * @param {*} itemName column name
 * @param {*} parse return as parsed JSON
 *
 * @returns {String|JSON} Retrieved data or an err string
 */
async function getItem(itemName, parse = false) {
  const params = {
    TableName: process.env.DYNAMODB_TABLE,
    Key: {
      user: process.env.DEFAULT_USER // Partition Key/Value
    },
    ProjectionExpression: itemName // Specify attribute to retrieve
  }

  try {
    const data = await documentClient.send(new GetCommand(params))
    
    // Check if item exists and has the requested attribute
    if (!data.Item || data.Item[itemName] === undefined) {
      return null
    }
    
    const itemValue = data.Item[itemName]
    
    // Handle empty or null values
    if (itemValue === null || itemValue === undefined) {
      return null
    }
    
    return parse ? JSON.parse(itemValue) : itemValue
  } catch (err) {
    console.error(`Error getting db item: '${itemName}'`)
    console.error(err)
    throw err // Throw error for consistency with setItem
  }
}

/**
 * Instead of purpose written methods for each attribute, this generic wrapper
 * uses the itemName to generate the appropriate `update` syntax.
 *
 * @param {*} itemName attribute to update
 * @param {*} data to update
 */
async function setItem(itemName, data) {
  const params = {
    TableName: process.env.DYNAMODB_TABLE,
    Key: {
      user: process.env.DEFAULT_USER
    },
    UpdateExpression: `set ${itemName} = :${itemName}`,
    ExpressionAttributeValues: {
      [`:${itemName}`]: data
    }
  }

  try {
    const result = await documentClient.send(new UpdateCommand(params))
    return result
  } catch (err) {
    console.error(`Error setting db item: '${itemName}'`)
    console.error(err)
    throw err // Throw error instead of returning it
  }
}

module.exports = {
  getItem,
  setItem
}
