const { hasValidToken, refreshToken, persistCache, deviceLogin } = require('./lib/auth')
const { getNote } = require('./lib/onenote')
const notify = require('./lib/notify')
const localStorage = require('./lib/store')
const { promises: fs } = require('fs')
const db = require('./db/persist')
const { snakeCase } = require("snake-case");

/**
 * Lambda functions have ephemeral storage on the server in /tmp.
 * Seed the MSAL Key Cache and localStorage with the latest from the database
 */
async function initCache(sectionHandle) {
  try {
    // populate cache with db contents
    const cacheData = db.getItem('cache')
    console.log(`Retrieved cache data from DynamoDB: ${cacheData ? 'Data found' : 'No data'} (type: ${typeof cacheData}, length: ${cacheData?.length || 0})`)

    if (cacheData && typeof cacheData === 'string' && cacheData.trim()) {
      const path = require('path')
      // Resolve to absolute path to handle webpack bundling context
      const cachePath = path.resolve(process.env.CACHE_PATH)
      await fs.writeFile(cachePath, cacheData)
      console.log('Cache restored to file system')
    } else {
      console.warn(`No valid cache data found in DynamoDB - cacheData: ${JSON.stringify(cacheData)} (type: ${typeof cacheData})`)
    }

    // populate local storage with login contents
    // coerced to json
    localStorage.initStore();
    const onenote = db.getItem('onenote', true)
    console.log(`Retrieved OneNote data from DynamoDB: ${onenote ? 'Data found' : 'No data'}`)

    if (onenote) {
      localStorage.setItem('onenote', onenote)
      console.log(`OneNote token expires: ${new Date(onenote.expiresOn)}, ExtExpires: ${new Date(onenote.extExpiresOn)}`)
    }

    const count = db.getItem(`${sectionHandle}_section_count`)
    localStorage.setItem(`${sectionHandle}_section_count`, count)

    const lastPage = db.getItem(`${sectionHandle}_last_page`)
    localStorage.setItem(`${sectionHandle}_last_page`, lastPage)

    const recent = db.getItem(`recent_${sectionHandle}`, true) || []
    // Ensure recent is always an array
    const recentArray = Array.isArray(recent) ? recent : []
    localStorage.setItem(`recent_${sectionHandle}`, recentArray)

    console.log('localStorage restoration completed')
  } catch (err) {
    console.error('Error initializing cache', err);
    throw err;
  }
}

const app = async (event, context) => {
  let { onenoteSettings, messageSettings } = event

  onenoteSettings = {
    sectionHandle: snakeCase(onenoteSettings.sectionName),
    isSequential: false,
    ...onenoteSettings
  }

  const resp = await initCache(onenoteSettings.sectionHandle)
  .then(() => refreshToken())
  .then(tokenResponse => {
    if (!tokenResponse || !hasValidToken()) {
      throw new Error('Token refresh failed - device login required');
    }
    return tokenResponse;
  })
  .then(() => getNote(onenoteSettings))
  .then(note => {
    if (typeof note === 'undefined') {
      throw new Error('Note is undefined');
    }
    return notify.withTelegram(note, messageSettings);
  })
  .catch(async err => {
    console.error('App: Check Logs', err);
    const errorMessage = err.errorMessage || err.message || String(err);

    if (err.message === 'Token refresh failed - device login required') {
      try {
        await deviceLogin();
      } catch (loginErr) {
        const loginErrorMsg = loginErr.errorMessage || loginErr.message || String(loginErr);
        await notify.sendNoteToTelegram(
          `Device login failed: ${loginErrorMsg}`,
          process.env.ADMIN_TELEGRAM_CHANNEL,
          null,
          true
        );
      }
    } else {
      await notify.sendNoteToTelegram(
        errorMessage,
        process.env.ADMIN_TELEGRAM_CHANNEL,
        null,
        true
      );
    }

    return {
      status: 400,
      title: 'Error',
      body: errorMessage
    };
  });

  return {
    status: resp.status,
    title: resp.title,
    body: resp.body
  }
}

module.exports = {
  app
}
