const {deviceLogin, hasValidToken} = require('./lib/auth');
const {getRandomNote} = require('./lib/onenote');
const {notify} = require('./lib/pushbullet');

const app = async (event, context) => {
  if(!hasValidToken()) {
    await deviceLogin()
  }

  return getRandomNote()
    .then((note) => {
      if (typeof note === 'undefined') {
        throw new Error()
      } else {
        // console.log(note)
        notify(note)
      }
    })
    .catch((err) => {
      console.log('Ooops!', `Can't seem to find any notes here. Please check if you created a section called '${process.env.NOTIFYER_SECTION}', add some notes.`)
      console.error('app', err)
    })
};

module.exports = {
  app,
};

