/* global localStorage */

if (typeof localStorage === "undefined" || localStorage === null) {
  var LocalStorage = require('node-localstorage').LocalStorage;
  const prefix = process.env.STAGE === 'prod' ? '/' : './'
  localStorage = new LocalStorage(`${prefix}${process.env.CACHE_BASE}`);
}

const storage = localStorage

let getItem = function (key) {
  return (localStorage.getItem(key) === undefined || null) ? null : JSON.parse(localStorage.getItem(key))
}

let removeItem = function (key) {
  localStorage.removeItem(key)
}

let setItem = function (key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

module.exports = {
  storage: storage,
  getItem: getItem,
  setItem: setItem,
  removeItem: removeItem
}
