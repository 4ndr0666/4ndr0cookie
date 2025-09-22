const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlPlugin = require('html-webpack-plugin');

module.exports = {
  entry: {
    popup: path.resolve('./src/popup/index.tsx'),
    options: path.resolve('./src/options/index.tsx'),
    background: path.resolve('./src/background/service-worker.ts'),
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader', 'postcss-loader'],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: path.resolve('src/assets'),
          to: path.resolve('dist/src/assets'),
          noErrorOnMissing: true,
        },
        {
          from: path.resolve('src/utils/sjcl.js'),
          to: path.resolve('dist/src/utils/sjcl.js'),
        },
        {
            from: path.resolve('manifest.json'),
            to: path.resolve('dist'),
        }
      ],
    }),
    new HtmlPlugin({
      title: '4ndr0cookie Popup',
      filename: 'src/popup/popup.html',
      chunks: ['popup'],
      template: path.resolve('./src/popup/popup.html'),
    }),
    new HtmlPlugin({
      title: '4ndr0cookie Options',
      filename: 'src/options/options.html',
      chunks: ['options'],
      template: path.resolve('./src/options/options.html'),
    }),
  ],
  output: {
    filename: '[name].js',
    path: path.resolve('dist'),
    clean: true,
  },
};
