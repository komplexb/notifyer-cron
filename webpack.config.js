// webpack.config.js
const path = require('path')
const slsw = require('serverless-webpack')
const CopyPlugin = require('copy-webpack-plugin')

module.exports = {
  entry: slsw.lib.entries,
  target: 'node18',
  mode: slsw.lib.webpack.isLocal ? 'development' : 'production',
  stats: 'minimal',
  devtool: 'nosources-source-map',
  performance: {
    hints: false
  },
  resolve: {
    extensions: ['.js', '.json'],
    fallback: {
      crypto: false
    },
    alias: {
      hexoid: 'hexoid/dist/index.js'
    }
  },
  output: {
    libraryTarget: 'commonjs2',
    path: path.join(__dirname, '.webpack'),
    filename: '[name].js',
    sourceMapFilename: '[file].map'
  },
  optimization: {
    minimize: false
  },
  plugins: [
    new CopyPlugin({
      patterns: [{ from: 'tmp/**/*' }]
    })
  ],
  node: {
    __dirname: true,
    __filename: true
  }
}
