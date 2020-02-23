const JavaScriptObfuscator = require('webpack-obfuscator');
const CopyPlugin = require('copy-webpack-plugin');
const path = require('path');

const devMode = process.env.NODE_ENV !== 'production';

const distDir = path.join(__dirname, 'dist');

const defaultConfig = {
  mode: process.env.NODE_ENV || 'development',
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: ['babel-loader'],
      },
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loader: 'eslint-loader',
        options: {
          emitWarning: true,
        },
      },
    ],
  },
  resolve: {
    extensions: ['*', '.js'],
  },
  node: {
    fs: 'empty',
    net: 'empty',
    tls: 'empty'
  }
};

module.exports = [{
  ...defaultConfig,
  entry: './src/index.js',
  output: {
    path: distDir,
    filename: 'ocrcc-chatbot.js',
  },
}];
