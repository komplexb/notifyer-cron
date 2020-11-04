const fetch = require('superagent')
const {login} = require('./lib/auth');
const {getRandomNote} = require('./lib/onenote');

function push (note) {
  const { title, noteLinks, preview: {previewText, links} } = note

  return new Promise((resolve, reject) => {
    fetch
      .post(process.env.PUSHBULLET_PUSH)
      .set('Access-Token', process.env.PUSHBULLET_ACCESS_TOKEN)
      .set('Content-Type', `application/json`)
      .send({
        "body": previewText,
        "title": `💡 ${title}`,
        "type": "link",
        "url": noteLinks.oneNoteClientUrl
      })
      .then((response) => {
        if (response && response.ok) {
          resolve(response);
        } else {
          throw new Error(response)
        }
      })
      .catch((err) => {
        console.error('push', err)
        reject(err)
      })
    })
}

const app = async (event, context) => {
  // return push
  login()
  return getRandomNote()
    .then((note) => {
      if (typeof note === 'undefined') {
        throw new Error()
      } else {
        console.log(note)
        // push(note)
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

