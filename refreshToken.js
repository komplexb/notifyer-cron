const {refreshToken} = require('./lib/auth');

const refresh = async (event, context) => {
  return refreshToken()
};

module.exports = {
  refresh,
};
