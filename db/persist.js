/**
 * Table Details
 * @user {String} primary key
 * @cache {String} cache store contents
 * @onenote {String} local storage contents
 * @onenote_section_count {String} local storage contents
 */

const AWS = require('aws-sdk')
AWS.config.update({ region: process.env.REGION })

const documentClient = new AWS.DynamoDB.DocumentClient({
  apiVersion: '2012-10-08'
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
    const data = await documentClient.get(params).promise()
    console.log(`Getting '${itemName}'`)

    return parse ? JSON.parse(data.Item[itemName]) : data.Item[itemName]
  } catch (err) {
    console.error(`Error getting db item: '${itemName}'`)
    console.error(err)
    return null
  }
}

/**
 * Retrieves the settings for a given item name.
 * create default db values for settings if they don't exist
 * @param {string} itemName - The name of the item.
 * @param {*} defaultVal - The default value to set if the item does not exist.
 * @param {boolean} [parse=false] - Indicates whether to parse the retrieved item.
 * @returns {Promise<*>} - The retrieved settings.
 * @throws {Error} - If the item name is not provided.
 */
async function getSettings(itemName, defaultVal, parse = false) {
  if(!itemName) throw new Error('Name is required');

  let data;
  try {
    console.log(`Getting settings for '${itemName}'`)
    data = await getItem(itemName, parse);
  } catch (error) {
    console.error(`Failed to get item: ${itemName}`, error);
    return null
  }

  if (!data) {
    console.log(`Creating default settings for '${itemName}'`)
    let newData;
    try {
      await setItem(itemName, defaultVal)
      newData = await getItem(itemName, parse)
    } catch (error) {
      console.error(`Failed to set item: ${itemName}`, error)
      return null
    }
    return newData
  }

  return data
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
    await documentClient.update(params).promise()
    console.log(`Attribute '${itemName}' Updated`)
  } catch (err) {
    console.error(`Error setting db item: '${itemName}'`)
    console.error(err)
    return err
  }
}

module.exports = {
  getItem,
  setItem,
  getSettings
}
