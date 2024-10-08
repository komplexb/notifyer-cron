const { deviceLogin, hasValidToken, refreshToken } = require('./lib/auth')
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
  // populate cache with db contents
  const data = await db.getItem('cache')
  await fs
    .writeFile(process.env.CACHE_PATH, data)
    .then(console.log('Restore Cache'))

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
      console.log('Token still invalid after refresh, initiating device login');
      return deviceLogin();
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
  .catch(err => {
    console.log(
      'Ooops!',
      `Can't seem to find any notes here. Please check if you created a section called '${onenoteSettings.sectionName}', add some notes.`
    );
    console.error('App: Check Logs', err);
    return {
      status: 400,
      title: 'Error',
      body: err
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
