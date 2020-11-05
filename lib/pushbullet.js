const fetch = require('superagent')

function push (note, login = false) {
  // const { title, noteLinks, preview: {previewText, links} } = note
  const msg = {
    "title": `🔒 Login`,
    "body": note,
    "type": "link",
    "url": "https://microsoft.com/devicelogin"
  }
  /* : {
    "title": `💡 ${title}`,
    "body": previewText,
    "type": "link",
    "url": noteLinks.oneNoteClientUrl
  } */

  console.log(msg)

  return new Promise((resolve, reject) => {
    fetch
      .post(process.env.PUSHBULLET_PUSH)
      .set('Access-Token', process.env.PUSHBULLET_ACCESS_TOKEN)
      .set('Content-Type', `application/json`)
      .send(msg)
      .then((response) => {
        if (response && response.ok) {
          resolve(response);
        } else {
          throw new Error(response)
        }
      })
      .catch((err) => {
        console.error('push', err)
      })
    })
}

module.exports = {
  push: push,
}
