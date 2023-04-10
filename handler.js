const { deviceLogin, hasValidToken, refreshToken } = require('./lib/auth')
const { getRandomNote } = require('./lib/onenote')
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

  const recent = (await db.getItem(`recent_${sectionHandle}`, true)) || []
  localStorage.setItem(`recent_${sectionHandle}`, recent)

  console.log('Restore localStorage', `${sectionHandle}: ${count}`, `recent: ${recent.length}`)
}

const app = async (event, context) => {
  let { onenoteSettings, messageSettings } = event

  onenoteSettings = {
    sectionHandle: snakeCase(onenoteSettings.sectionName),
    ...onenoteSettings
  }

  await initCache(onenoteSettings.sectionHandle) // setup the files needed for the app to work
  await refreshToken() // refresh the tokens needed for MS Graph Calls

  if (!hasValidToken()) {
    await deviceLogin()
  }

  const resp = await getRandomNote(onenoteSettings)
    .then(note => {
      if (typeof note === 'undefined') {
        throw new Error()
      }
      return notify.withTelegram(
        note,
        messageSettings
      )
    })
    .catch(err => {
      console.log(
        'Ooops!',
        `Can't seem to find any notes here. Please check if you created a section called '${onenoteSettings.sectionName}', add some notes.`
      )
      console.error('App: Check Logs', err)
      return {
        err
      }
    })

  return {
    status: resp.status,
    title: resp.body.title,
    body: resp.body.body
  }
}

module.exports = {
  app
}

if (require.main === module) {
  console.log("debugging");
  exports.app();
}