const fetch = require('superagent')
const msal = require('@azure/msal-node');
const {requestOneNoteToken} = require('./lib/auth');

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

const auth = cca.acquireTokenByClientCredential(clientCredentialRequest).then((response) => {
  // console.log(JSON.stringify(response));
  /* return new Promise((resolve) => {
    resolve(response);
  }) */
}).catch((error) => {
  console.log(JSON.stringify(error));
  /* return new Promise((reject) => {
    reject(JSON.stringify(error));
  }) */
});

const token = requestOneNoteToken({
  client_id: process.env.NOTIFYER_CLIENT_ID,
  scope: process.env.MS_GRAPH_DEFAULT_SCOPE,
  client_secret: process.env.NOTIFYER_CLIENT_SECRET,
  grant_type: 'client_credentials',
})
.then((response) => {
  // console.log(JSON.stringify(response))
})
.catch(() => {
  /** TODO: update error state and display on login **/
})


/* const note = new Promise((resolve, reject) => {
    const page = 'onenote/pages/0-c6fb98c347f5f24bb4051f4110ce7149!1-BCF85C11D5B7B27C!58648'
    fetch
      .get(`${process.env.MS_GRAPH_ROOT}/${page}/preview`)
      .timeout({
        response: 120000,  // Wait 60 seconds for the server to start sending,
        deadline: 60000 // but allow 1 minute for the file to finish loading.
      })
      .set('Authorization', `Bearer ${token.access_token}`)
      .then(function (response) {
        if (response && response.ok) {
          resolve(response)
        } else {
          console.log(response)
          reject(response)
        }
      })
      .catch(function (err) {
        console.log(err)
        reject(err)
      })
  }) */

const push = new Promise(function(resolve, reject) {
    fetch
      .post(process.env.PUSHBULLET_PUSH)
      .set('Access-Token', process.env.PUSHBULLET_ACCESS_TOKEN)
      .set('Content-Type', `application/json`)
      .send({
        "body": "note.previewText",
        "title": `💡 Space Travel Ideas`,
        "type": "link",
        "url": "onenote:https://d.docs.live.net/bcf85c11d5b7b27c/Google%20Drive/Documents/Byron's%20Notebook/Quotes.one#Get%20a%20handle%20on%20current%20habits%20&section-id=462749c3-f185-4479-b50f-173b258d70e9&page-id=c9ccba27-23ab-734c-acf5-8713ad528ce3&end"
      })
      .then(function (response) {
        if (response && response.ok) {
          console.log(response)
          resolve(response);
        } else {
          reject(response)
        }
      })
      .catch(function (err) {
        reject(err)
      })
    })

const app = async (event, context) => {
  return push
};

module.exports = {
  app,
};

