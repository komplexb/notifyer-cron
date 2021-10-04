const cheerio = require('cheerio');

const { getNoteContents }  = require('./onenote')

const fetch = require('superagent')

// => oneNoteClientUrl || oneNoteWebUrl
const oneNoteAppUrl = `oneNote${process.env.ONENOTE_CLIENT.split(',')[0]}Url`

function formatNoteBody(url) {

  getNoteContents(url)
  .then((page) => {
    // extract page body content from note
    const $ = cheerio.load(page.content, null, false);
    const wrapper = $('div')
    console.log("content", page.content)
    console.warn("------------------------")
    console.log("wrapper", wrapper)
    console.warn("------------------------")
    console.log("html", wrapper.html())

    // remove images
    const images = wrapper.find('img')
    console.log("images", images)

    for (let img of images) {
      img.remove()
    }
    return wrapper.html()
  })
  .catch(function (err) {
    console.error(err)
    return ""
  })
}

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
    url,
    preview: { previewText, links }
  } = note

  const imageUrl = links && links.previewImageUrl ? links.previewImageUrl.href : null

  const body = formatNoteBody(url);

  // console.log(title, body)

  return {
    title: `${icon} ${title}`,
    body: body,
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
 * Send note to Pushbullet Client
 *
 * @param {*} note
 * @param {*} login - format note as device login dialog
 */
function telegram(note, icon = '🔒', login = false) {
  const msg = structureMessage(note, icon, login)

  const baseUrl = process.env.TELEGRAM_URL.replace(
    '{NotifyerBotToken}',
    process.env.TELEGRAM_BOT_TOKEN
  )
  const urlPath = 'sendMessage'
  // msg.imageUrl ? 'sendPhoto' : 'sendMessage'

  // const ampersand = /&/g
  // const quote = /'/g
  // const openInOnenote = msg.url
  //   .replace(ampersand, '&amp;')
  //   .replace(quote, '&quot;')
  //   .replace('onenote:', '')

  const defaultRequest = {
    chat_id: process.env.DEFAULT_TELEGRAM_CHANNEL,
    disable_web_page_preview: true,
    parse_mode: 'HTML',
    reply_markup: JSON.stringify({
      text: msg.title,
      url: msg.webUrl
    })
  }

  const text = `<a href='${msg.webUrl}'><b>${msg.title}</b></a>\n\n${msg.body}`
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
        console.error('push', err)
      })
  })
}

module.exports = {
  withPush: push,
  withTelegram: telegram
}
