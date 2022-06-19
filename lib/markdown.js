const telegramifyMarkdown = require('telegramify-markdown')
const TurndownService = require('turndown/lib/turndown.umd')

const turndownService = new TurndownService()
turndownService.addRule('onenoteToMarkdown', {
  filter: ['span', 'p'],
  replacement: function (content, node, options) {
    content = escapedMarkdown(content)

    const style = node._attrsByQName.style

    const isHighlighted =
      style.data.includes('yellow') || style.data.includes('underline')
    const isQuote = style.data.includes('Consolas')

    if (isQuote) {
      return options.fence + content + options.fence
    }
    if (isHighlighted) {
      return '`' + content + '`'
    }
    if (style.data.includes('bold')) {
      return options.strongDelimiter + content + options.strongDelimiter
    }
    if (style.data.includes('italic')) {
      return options.emDelimiter + content + options.emDelimiter
    }
    return content
  }
})

turndownService.addRule('formatParagraphs', {
  filter: 'p',
  replacement: function (content) {
    content = escapedMarkdown(content)

    return '\n' + content + '\n'
  }
})

function escapedMarkdown(text) {
  // escape telegram reserved character
  const re = /\-/g
  return text.replace(re, `\-`)
}

function format(text) {
  return telegramifyMarkdown(turndownService.turndown(text))
}

module.exports = {
  htmlToMarkdown: format
}
