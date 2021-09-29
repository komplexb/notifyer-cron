const fetch = require('superagent')

// => oneNoteClientUrl || oneNoteWebUrl
const oneNoteAppUrl = `oneNote${process.env.ONENOTE_CLIENT.split(',')[0]}Url`

function structureMessage(note, icon = '🔒', isLogin = false) {
  if (isLogin) {
    return {
      title: `${icon} Login`,
      body: note,
      type: 'link',
      url: 'https://microsoft.com/devicelogin'
    }
  }
  const {
    title,
    noteLinks,
    preview: { previewText }
  } = note
  return {
    title: `${icon} ${title}`,
    body: previewText,
    type: 'link',
    url: noteLinks[oneNoteAppUrl].href,
    webUrl: noteLinks.oneNoteWebUrl.href
  }
}

/**
 * Send note to Pushbullet Client
 *
 * @param {*} note
 * @param {*} login - format note as device login dialog
 */
function push(note, icon = '🔒', login = false) {
  const msg = structureMessage(note, icon, login)

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
/**
 * Send note to Pushbullet Client
 *
 * @param {*} note
 * @param {*} login - format note as device login dialog
 */
function telegram(note, icon = '🔒', login = false) {
  const msg = structureMessage(note, icon, login)

  const formattedMessage = `<b>${msg.title}</b>\n${msg.body}\n<a href='${msg.webUrl}'>See entire note</a>`

  return new Promise((resolve, reject) => {
    fetch
      .get(
        process.env.TELEGRAM_URL.replace(
          '{NotifyerBotToken}',
          process.env.TELEGRAM_BOT_TOKEN
        )
      )
      .send({
        chat_id: '@notifyer_quotes',
        text: formattedMessage,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
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
  withPush: push,
  withTelegram: telegram
}
