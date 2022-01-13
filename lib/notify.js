const HTMLParser = require('node-html-parser')
const { NodeHtmlMarkdown } = require ('node-html-markdown')
const { markdownv2 } = require('telegram-format')

const { getNoteContents }  = require('./onenote')

const fetch = require('superagent')

// => oneNoteClientUrl || oneNoteWebUrl
const oneNoteAppUrl = `oneNote${process.env.ONENOTE_CLIENT.split(',')[0]}Url`

async function formatNoteBody(url) {
  let body = await getNoteContents(url)
  .then((page) => {
    // extract page body content from note
    const wrapper = HTMLParser.parse(page.content);

    // remove images
    const el = wrapper.querySelector('div')
    for (let img of el.querySelectorAll('img')) {
      img.remove()
    }
    return el.toString()
  })
  .catch(function (err) {
    console.error(err)
    return ""
  })

  return body
}

async function structureMessage(note, icon = '🔒', isLogin = false) {
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
    url,
    preview: { previewText, links }
  } = note

  const imageUrl = links && links.previewImageUrl ? links.previewImageUrl.href : null

  const body = await formatNoteBody(url);

  const isMsgTooLong = `${icon} ${title}`.length + body.length > 4096

  return {
    title: `${icon} ${title}`,
    body: imageUrl || isMsgTooLong ? previewText : body,
    type: 'link',
    url: noteLinks[oneNoteAppUrl].href,
    webUrl: noteLinks.oneNoteWebUrl.href,
    imageUrl
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
 * Send note to Telegram Channel
 *
 * @param {*} note
 * @param {*} login - format note as device login dialog
 */
async function telegram(note, icon = '🔒', login = false) {
  const msg = await structureMessage(note, icon, login)

  const baseUrl = process.env.TELEGRAM_URL.replace(
    '{NotifyerBotToken}',
    process.env.TELEGRAM_BOT_TOKEN
  )
  const urlPath = 'sendMessage'
  // msg.imageUrl ? 'sendPhoto' : 'sendMessage'

  // const openInOnenote = markdownv2.url("Open In OneNote", markdownv2.escape(msg.url))

  const defaultRequest = {
    chat_id: process.env.DEFAULT_TELEGRAM_CHANNEL,
    disable_web_page_preview: true,
    parse_mode: 'MarkdownV2',
  }

  let text = markdownv2.bold(markdownv2.url(markdownv2.escape(msg.title), msg.webUrl))
  text += markdownv2.escape(`\n\n`)
  text += markdownv2.escape(NodeHtmlMarkdown.translate(msg.body))
  text += markdownv2.escape(`\n\n`)

  const caption = `<b>${msg.title}</b>\n<a href='${msg.webUrl}'>See entire note</a>`

  let request;
  if(urlPath === 'sendMessage') {
    request = { ...defaultRequest, text}
  } else {
    request = {
      ...defaultRequest,
      photo: msg.imageUrl,
      caption
    }
  }


  return new Promise((resolve, reject) => {
    fetch
    .get(`${baseUrl}/${urlPath}`)
    .send(request)
      .then(response => {
        if (response && response.ok) {
          console.log('Note Pushed!')
          resolve(response)
        } else {
          throw new Error(response)
        }
      })
      .catch(err => {
        console.error('Title: ', msg.title)
        console.error('telegram', err.response.body.description)
      })
  })
}

module.exports = {
  withPush: push,
  withTelegram: telegram
}
