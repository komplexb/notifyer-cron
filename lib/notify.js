const { htmlToMarkdown } = require('./markdown')
const HTMLParser = require('node-html-parser')
const { markdownv2 } = require('telegram-format')
const { getNoteContents }  = require('./onenote')

const fetch = require('superagent')

// => oneNoteClientUrl || oneNoteWebUrl
const oneNoteAppUrl = `oneNote${process.env.ONENOTE_CLIENT}Url`
// const oneNoteAppUrl = `oneNote${process.env.ONENOTE_CLIENT.split(',')[0]}Url`

async function formatNoteBody(url) {
  let body = await getNoteContents(url)
  .then((page) => {
    // extract page body content from note
    const wrapper = HTMLParser.parse(page.content);
    // console.log(page.content)

    // remove images
    const el = wrapper.querySelector('div')
    if (el) {
      for (let img of el.querySelectorAll('img')) {
        console.log("removing image: ", img.getAttribute("alt"))
        img.remove()
      }
      return htmlToMarkdown(el.toString())
    }
    return "";
  })
  .catch(function (err) {
    console.error("formatNoteBody()", err)
    return ""
  })

  return body
}

async function structureMessage(note, titlePrefix, isLogin = false) {
  if (isLogin) {
    return {
      title: `Login`,
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

  const isMsgTooLong = (titlePrefix.length + title.length + body.length) > 4096 + 22

  return {
    prefix: titlePrefix,
    title,
    body: isMsgTooLong ? previewText : body,
    type: 'link',
    url: noteLinks[oneNoteAppUrl].href,
    webUrl: noteLinks.oneNoteWebUrl.href,
    imageUrl,
    previewText
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
async function withTelegram(note, messageSettings, login = false) {
  const { titlePrefix, channelHandle = process.env.DEFAULT_TELEGRAM_CHANNEL, showEditLink = false, disablePreview = true } = messageSettings
  const msg = await structureMessage(note, titlePrefix, login)

  let text = markdownv2.bold(markdownv2.escape(msg.prefix))
  text += markdownv2.escape(`\n\n`)
  text += markdownv2.underline(markdownv2.escape(msg.title))
  text += markdownv2.escape(`\n\n`)
  text += msg.body

  if(showEditLink) {
    // const openInOnenote = markdownv2.url("Open In OneNote", markdownv2.escape(msg.url))
    text += markdownv2.escape(`\n\n`)
    text += markdownv2.url("Edit note", msg.webUrl)
  }

  return new Promise(async(resolve, reject) => {
    try {
      await sendNoteToTelegram(text, channelHandle, { disable_web_page_preview: disablePreview });
      resolve({
        status: 200,
        title: msg.title,
        body: msg.previewText,
      })
    } catch (err) {
      console.error('Title: ', msg.title)
      console.error('withTelegram', err.response.body.description)
      reject({
        status: 400,
        title: msg.title || 'Error',
        body: err.response.body.description,
      })
    }
  });
}

const sendNoteToTelegram = async(msg, channelHandle, requestArgs, escapeMsg = false) => {
  const standardRequest = {
    text: escapeMsg ? markdownv2.escape(msg) : msg,
    chat_id: channelHandle,
    disable_web_page_preview: true,
    parse_mode: 'MarkdownV2',
  }
  const baseUrl = process.env.TELEGRAM_URL.replace(
    '{NotifyerBotToken}',
    process.env.TELEGRAM_BOT_TOKEN
  )
  const urlPath = 'sendMessage';
  const request = requestArgs ? { ...standardRequest, ...requestArgs } : standardRequest;
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
        reject(err);
      })
  })
}

module.exports = {
  withPush: push,
  withTelegram,
  sendNoteToTelegram
}
