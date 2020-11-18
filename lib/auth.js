const msal = require('@azure/msal-node')
const storage = require('./store')
const db = require('../db/persist')
const { notify } = require('./pushbullet')
const { promises: fs } = require('fs')

const msalConfig = {
  scopes: ['user.read', 'notes.read', 'offline_access'],
  auth: {
    clientId: process.env.NOTIFYER_CLIENT_ID,
    authority: process.env.MS_GRAPH_AUTHORITY
  }
}

const prefix = process.env.STAGE === 'prod' ? '/' : './'
const cachePath = `${prefix}${process.env.CACHE_PATH}`

function cachePlugin () {
  // Call back APIs which automatically write and read into a .json file - example implementation
  const beforeCacheAccess = async cacheContext => {
    cacheContext.tokenCache.deserialize(await fs.readFile(cachePath, 'utf-8'))
  }

  const afterCacheAccess = async cacheContext => {
    if (cacheContext.cacheHasChanged) {
      await fs.writeFile(cachePath, cacheContext.tokenCache.serialize())
      const data = await fs.readFile(cachePath, 'utf-8')
      db.setItem('cache', data)
    }
  }

  // Cache Plugin
  return {
    beforeCacheAccess,
    afterCacheAccess
  }
}

function deviceLogin () {
  console.log(/********* login() ********/)
  const config = {
    auth: msalConfig.auth,
    cache: {
      cachePlugin: cachePlugin()
    } // your implementation of cache plugin
  }

  const pca = new msal.PublicClientApplication(config)

  const deviceCodeRequest = {
    deviceCodeCallback: response => notify(response.message, true),
    scopes: msalConfig.scopes
  }

  return pca
    .acquireTokenByDeviceCode(deviceCodeRequest)
    .then(response => {
      storage.setItem('onenote', { datestamp: Date.now(), ...response }, true)
      console.log('logged in')
      resolve()
    })
    .catch(error => {
      console.error('login', JSON.stringify(error))
    })
}

/**
 * Exchange the authorization code for an access token [and refresh token].
 * Send the following HTTP request with a properly encoded URL string in the message body.
 * https://msdn.microsoft.com/en-us/office/office365/howto/onenote-auth#code-flow
 *
 * @returns {Promise} Ensures the caller acts after response is received
 */
async function refreshToken () {
  console.log(/********* refreshToken() ********/)

  const { homeAccountId, environment } = storage.getItem('onenote').account
  const { aud } = storage.getItem('onenote').idTokenClaims

  let cache
  await fs
    .readFile(cachePath, 'utf-8')
    .then(data => {
      cache = JSON.parse(data)
    })
    .catch(error => {
      console.log('Cache Error', error)
    })

  const refreshToken =
    cache.RefreshToken[`${homeAccountId}-${environment}-refreshtoken-${aud}--`]
      .secret

  const pca = new msal.PublicClientApplication({
    auth: msalConfig.auth,
    cache: {
      cachePlugin: cachePlugin()
    }
  })

  const refreshTokenRequest = {
    refreshToken,
    scopes: msalConfig.scopes
  }

  return new Promise((resolve, reject) => {
    pca
      .acquireTokenByRefreshToken(refreshTokenRequest)
      .then(response => {
        // console.log("refresh", JSON.stringify(response))
        storage.setItem('onenote', { datestamp: Date.now(), ...response }, true)
        // console.log(storage.getItem('onenote'))
        console.log('Token Refreshed')
        resolve()
      })
      .catch(error => {
        console.error('refreshToken', error.status, JSON.stringify(error))
        reject(error)
      })
  })
}

function hasValidToken () {
  if (storage.getItem('onenote') === null) {
    return false
  }

  return Date.now() <= Date.parse(storage.getItem('onenote').expiresOn)
}

module.exports = {
  refreshToken,
  deviceLogin,
  hasValidToken
}
