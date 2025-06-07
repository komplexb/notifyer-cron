const { deviceLogin, hasValidToken, refreshToken, persistCache } = require('./lib/auth')
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
    const data = await db.getItem('cache')
    const path = require('path')
    // Resolve to absolute path to handle webpack bundling context
    const cachePath = path.resolve(process.env.CACHE_PATH)
    await fs.writeFile(cachePath, data)
    console.log('Restore Cache')

    // populate local storage with login contents
    // coerced to json
    localStorage.initStore();
    const onenote = await db.getItem('onenote', true)
    localStorage.setItem('onenote', onenote)

    const count = await db.getItem(`${sectionHandle}_section_count`)
    localStorage.setItem(`${sectionHandle}_section_count`, count)

    const lastPage = await db.getItem(`${sectionHandle}_last_page`)
    localStorage.setItem(`${sectionHandle}_last_page`, lastPage)

    const recent = (await db.getItem(`recent_${sectionHandle}`, true)) || []
    localStorage.setItem(`recent_${sectionHandle}`, recent)

    console.log('Restore localStorage')
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
  .then(() => {
    console.log('Cache initialized, checking token validity');
    return refreshToken();
  })
  .then(async tokenResponse => {
    if (!tokenResponse || !hasValidToken()) {
      console.error('Token refresh returned invalid token');
      throw new Error('Token refresh failed - device login required');
    }
    console.log('Token refresh successful, ensuring cache persistence');
    
    // Ensure cache is persisted after successful refresh
    await persistCache();
    
    console.log('Proceeding with OneNote API calls');
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
        console.log('Attempting device login after token refresh failure');
        await deviceLogin();
        console.log('Device login successful, manually persisting cache');
        
        // Ensure cache is persisted to DynamoDB
        await persistCache();
        
        await notify.sendNoteToTelegram(
          'Device login completed successfully. Authentication restored.',
          process.env.ADMIN_TELEGRAM_CHANNEL,
          null,
          true
        );
        
        // Return success after device login
        return {
          status: 200,
          title: 'Authentication Restored',
          body: 'Device login completed successfully'
        };
      } catch (loginErr) {
        const loginErrorMsg = loginErr.errorMessage || loginErr.message || String(loginErr);
        console.error('Device login failed:', loginErrorMsg);
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
