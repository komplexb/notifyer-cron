const {refreshToken} = require('./lib/auth');

const app = async (event, context) => {
  return refreshToken()
};

module.exports = {
  app,
};
