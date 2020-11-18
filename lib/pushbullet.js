const fetch = require('superagent')

// => oneNoteClientUrl || oneNoteWebUrl
const oneNoteUrl = `oneNote${process.env.ONENOTE_CLIENT.split(',')[0]}Url`

function push (note, login = false) {
  let msg
  if (login) {
    msg = {
      title: `🔒 Login`,
      body: note,
      type: 'link',
      url: 'https://microsoft.com/devicelogin'
    }
  } else {
    const {
      title,
      noteLinks,
      preview: { previewText }
    } = note
    msg = {
      title: `💡 ${title}`,
      body: previewText,
      type: 'link',
      url: noteLinks[oneNoteUrl].href
    }
  }

  return new Promise((resolve, reject) => {
    fetch
      .post(process.env.PUSHBULLET_PUSH)
      .set('Access-Token', process.env.PUSHBULLET_ACCESS_TOKEN)
      .set('Content-Type', `application/json`)
      .send(msg)
      .then(response => {
        if (response && response.ok) {
          console.log('Note Pushed!')
          resolve(response)
        } else {
          throw new Error(response)
        }
      })
      .catch(err => {
        console.error('push', err)
      })
  })
}

module.exports = {
  notify: push
}
