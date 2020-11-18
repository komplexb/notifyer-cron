const {deviceLogin, hasValidToken, refreshToken} = require('./lib/auth');
const {getRandomNote} = require('./lib/onenote');
const {notify} = require('./lib/pushbullet');
const storage = require('./lib/store')
const { promises: fs } = require("fs");
const db = require('./db/persist')

async function initCache() {
  const prefix = process.env.STAGE === 'prod' ? '/' : './'
  const cachePath = `${prefix}${process.env.CACHE_PATH}`;

  // populate cache with db contents
  const data = await db.getItem('cache')
  await fs.writeFile(cachePath, data).then(console.log('init cache'))

  // populate local storage with login contents
  // coherced to json
  const onenote = await db.getItem('onenote', true)
  storage.setItem('onenote', onenote)
  console.log('init local storage')
}

const app = async (event, context) => {
  await initCache()
  await refreshToken()

  if(!hasValidToken()) {
    await deviceLogin()
  }

  const resp = await getRandomNote()
    .then((note) => {
      if (typeof note === 'undefined') {
        throw new Error()
      } else {
        return notify(note);
      }
    })
    .catch((err) => {
      console.log('Ooops!', `Can't seem to find any notes here. Please check if you created a section called '${process.env.NOTIFYER_SECTION}', add some notes.`)
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
};

module.exports = {
  app
};

