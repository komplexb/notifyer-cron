const apiRequests = require('superagent')
const msal = require('@azure/msal-node');
// const {URLS, TIMEOUTS} = require('../../app.config')
// const {ONENOTE} = require('../../onenote.config')
const storage = require('./store')

const TIMEOUTS = {
  response: 120000,  // Wait 60 seconds for the server to start sending,
  deadline: 60000 // but allow 1 minute for the file to finish loading.
}

function login() {
  console.log(/********* login() ********/)
  const config = {
    auth: {
      clientId: process.env.NOTIFYER_CLIENT_ID,
      authority: `https://${process.env.MS_GRAPH_HOST}/consumer`,
      clientSecret: process.env.NOTIFYER_CLIENT_SECRET
    }
  };

  // Create msal application object
  const cca = new msal.ConfidentialClientApplication(config);

  // With client credentials flows permissions need to be granted in the portal by a tenant administrator.
  // The scope is always in the format "<resource>/.default"
  const clientCredentialRequest = {
      scopes: [process.env.MS_GRAPH_DEFAULT_SCOPE],
  };

  cca.acquireTokenByClientCredential(clientCredentialRequest).then((response) => {
    console.log(JSON.stringify(response));
  }).catch((error) => {
    console.error('login', JSON.stringify(error));
  });
}

/**
 * Exchange the authorization code for an access token [and refresh token].
 * Send the following HTTP request with a properly encoded URL string in the message body.
 * https://msdn.microsoft.com/en-us/office/office365/howto/onenote-auth#code-flow
 *
 * @returns {Promise} Ensures the caller acts after response is received
 */
function requestOneNoteToken (postParams) {
  console.log(/********* requestOneNoteToken() ********/)
  return new Promise((resolve, reject) => {
    apiRequests
    .post(`https://${process.env.MS_GRAPH_HOST}/consumers/oauth2/v2.0/token`, postParams)
    .timeout(TIMEOUTS)
    .set('Content-Type', 'application/x-www-form-urlencoded')
    .then((response) => {
      if (response && response.ok) {
        // Success - Received Token.
        storage.setItem('onenote', { datestamp: Date.now(), ...response.body })
        // console.log(storage.getItem('onenote'))
        resolve()
      } else {
        throw new Error(response)
      }
    })
    .catch( (err) => {
      console.error('requestOneNoteToken', err.status, JSON.parse(err.response.text).error.message)
      reject(err)
    })
  })
}

module.exports = {
  requestOneNoteToken: requestOneNoteToken,
  login: login,
}
