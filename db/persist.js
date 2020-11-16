const AWS = require('aws-sdk')
AWS.config.update({region: process.env.REGION})

const documentClient = new AWS.DynamoDB.DocumentClient({ apiVersion: "2012-10-08"});

async function getItem(itemName, parse = false) {
  const params = {
    TableName: process.env.DYNAMODB_TABLE,
    Key: {
      user: process.env.DEFAULT_USER
    }
  }

  try {
    const data = await documentClient.get(params).promise();
    // console.log(JSON.parse(data.Item[itemName]));
    console.log(`${itemName} Read`);
    return parse ? JSON.parse(data.Item[itemName]) : data.Item[itemName]
  } catch (err) {
    console.log(err);
    return(err)
  }
}

async function setItem(itemName, data) {
  const expressionConfig = {
    [itemName]: {
      UpdateExpression: `set ${itemName} = :${itemName[0]}`,
      ExpressionAttributeValues: {
        [`:${itemName[0]}`]: data
      }
    },
  }

  const params = {
    TableName: process.env.DYNAMODB_TABLE,
    Key: {
      user: process.env.DEFAULT_USER
    }
  }

  try {
    const data = await documentClient.update({...params, ...expressionConfig[itemName]}).promise();
    console.log(`${itemName} Updated`);
  } catch (err) {
    console.log(err);
    return(err)
  }
}

module.exports = {
  getItem, setItem
}