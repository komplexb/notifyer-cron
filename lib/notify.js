const { htmlToMarkdown } = require('./markdown')
const HTMLParser = require('node-html-parser')
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
    // console.log(page.content)

    // remove images
    const el = wrapper.querySelector('div')

    if (el) {
      for (let img of el.querySelectorAll('img')) {
        console.log("removing image: ", img.getAttribute("alt"))
        img.remove()
      }
      return {
        body: htmlToMarkdown(el.toString()),
        source: getSourceLink(el)
      }
    }
    return { body: "", source: "" }
  })
  .catch(function (err) {
    console.error("formatNoteBody()", err)
    return { body: "", source: "" }
  })

  return body
}

/**
 * Get the source link from the note body
 * search el for text "Clipped from: " or "Source: "
 * if found, select the first href after that location
 *
 * @param {*} el
 * @returns
 */
const getSourceLink = (el) => {
  let text = el.innerText;
  let clippedFromIndex = text.indexOf('Clipped from: ');
  let sourceIndex = text.indexOf('Source: ');

  let link;
  let links = el.querySelectorAll('a');
  for (let i = 0; i < links.length; i++) {
      let linkPosition = text.indexOf(links[i].innerText);
      if ((clippedFromIndex !== -1 && clippedFromIndex < linkPosition) ||
          (sourceIndex !== -1 && sourceIndex < linkPosition)) {
          link = links[i].getAttribute('href');
          break;
      }
  }
  return link ? `Source: ${htmlToMarkdown(link)}` : "";
}

async function structureMessage(args) {
  const { note, titlePrefix, isLogin = false } = args;
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

  const content = await formatNoteBody(url);

  const isMsgTooLong = (titlePrefix.length + title.length + content.body.length) > 4096 + 22

  const previewBody = markdownv2.escape(previewText) + markdownv2.escape(`\n\n`) + content.source

  return {
    prefix: titlePrefix,
    title,
    body: isMsgTooLong ? previewBody : content.body,
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
  const msg = structureMessage({note, titlePrefix: icon, isLogin: login})

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
  const {
    titlePrefix,
    channelHandle = process.env.DEFAULT_TELEGRAM_CHANNEL,
    showEditLink = false,
    disablePreview = true,
  } = messageSettings
  const msg = await structureMessage({ note, titlePrefix, isLogin: login })

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
