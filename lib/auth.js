const apiRequests = require('superagent')
// const {URLS, TIMEOUTS} = require('../../app.config')
// const {ONENOTE} = require('../../onenote.config')
// const storage = require('./store')

/**
 * Exchange the authorization code for an access token [and refresh token].
 * Send the following HTTP request with a properly encoded URL string in the message body.
 * https://msdn.microsoft.com/en-us/office/office365/howto/onenote-auth#code-flow
 *
 * @returns {Promise} Ensures the caller acts after response is received
 */
function requestOneNoteToken (postParams) {
  return new Promise((resolve, reject) => {
    apiRequests
    .post(`https://${process.env.MS_GRAPH_HOST}/consumers/oauth2/v2.0/token`, postParams)
    .timeout({
      response: 120000,  // Wait 60 seconds for the server to start sending,
      deadline: 60000 // but allow 1 minute for the file to finish loading.
    })
    .set('Content-Type', 'application/x-www-form-urlencoded')
    .then(function (response) {
      if (response && response.ok) {
        // Success - Received Token.
        resolve(response.body)
      } else {
        console.error(postParams.grant_type, response.text)
        reject(response.text)
      }
    })
    .catch(function (err) {
      console.log('error', postParams.grant_type, err)
      reject(err)
    })
  })
}

module.exports = {
  requestOneNoteToken: requestOneNoteToken,
}
