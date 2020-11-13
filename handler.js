const {deviceLogin, hasValidToken} = require('./lib/auth');
const {getRandomNote} = require('./lib/onenote');
const {notify} = require('./lib/pushbullet');
const { promises: fs } = require("fs");

function initCache() {
  /* fs.copyFile('./tmp/onenote', '/tmp/onenote')
  .then(() => console.log('"onenote" was copied to tmp'))
  .catch(() => console.log('"onenote" could not be copied'))

  fs.copyFile('./tmp/cache.json', '/tmp/cache.json')
  .then(() => console.log('"cache.json" was copied to tmp'))
  .catch(() => console.log('"cache.json" could not be copied')) */
}

const app = async (event, context) => {
  if(process.env.STAGE === 'prod') {
    initCache()
  }

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
      console.error('app', err)
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
  app,
};

