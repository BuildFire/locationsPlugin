const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const WebpackConfig = {

  // Source map type
  // @see https://webpack.js.org/configuration/devtool/
  devtool: 'eval-source-map',

  entry: {
    //  Webpack dev server
    'devServer': `webpack-dev-server/client?http://0.0.0.0:8080`,

    // Plugin entry points
    'control/content/content': path.join(__dirname, '../src/control/content/content.js'),
    'control/design/design': path.join(__dirname, '../src/control/design/design.js'),
    'control/settings/settings': path.join(__dirname, '../src/control/settings/settings.js'),
    'control/tests/tests': path.join(__dirname, '../src/control/tests/tests.js'),
    'control/strings/strings': path.join(__dirname, '../src/control/strings/strings.js'),
    'widget/widget': path.join(__dirname, '../src/widget/widget.js')
  },

  output: {
    path: path.join(__dirname, '../'),
    filename: '[name].js',
    publicPath: 'http://0.0.0.0:8080/'
  },

  externals: {
    buildfire: 'buildfire',
    sortable: 'sortable',
    tinymce: 'tinymce',
  },

  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /(node_modules|bower_components)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },

  plugins: [
    new HtmlWebpackPlugin({
      filename: 'control/content/index.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/content/index.html'),
      chunks: ['devServer', 'control/content/content']
    }),
    new HtmlWebpackPlugin({
      filename: 'control/content/templates/categories.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/content/templates/categories.html'),
      chunks: ['devServer']
    }),
    new HtmlWebpackPlugin({
      filename: 'control/content/templates/locations.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/content/templates/locations.html'),
      chunks: ['devServer']
    }),
    new HtmlWebpackPlugin({
      filename: 'control/content/templates/listView.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/content/templates/listView.html'),
      chunks: ['devServer']
    }),
    new HtmlWebpackPlugin({
      filename: 'control/design/index.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/design/index.html'),
      chunks: ['devServer', 'control/design/design']
    }),
    new HtmlWebpackPlugin({
      filename: 'control/settings/index.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/settings/index.html'),
      chunks: ['devServer', 'control/settings/settings']
    }),
    new HtmlWebpackPlugin({
      filename: 'control/settings/templates/globalSettings.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/settings/templates/globalSettings.html'),
      chunks: ['devServer']
    }),
    new HtmlWebpackPlugin({
      filename: 'control/settings/templates/sorting.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/settings/templates/sorting.html'),
      chunks: ['devServer']
    }),
    new HtmlWebpackPlugin({
      filename: 'control/settings/templates/filtering.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/settings/templates/filtering.html'),
      chunks: ['devServer']
    }),
    new HtmlWebpackPlugin({
      filename: 'control/settings/templates/map.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/settings/templates/map.html'),
      chunks: ['devServer']
    }),
    new HtmlWebpackPlugin({
      filename: 'control/settings/templates/bookmarks.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/settings/templates/bookmarks.html'),
      chunks: ['devServer']
    }),
    new HtmlWebpackPlugin({
      filename: 'control/settings/templates/globalEditing.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/settings/templates/globalEditing.html'),
      chunks: ['devServer']
    }),
    new HtmlWebpackPlugin({
      filename: 'control/settings/templates/globalEntries.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/settings/templates/globalEntries.html'),
      chunks: ['devServer']
    }),
    new HtmlWebpackPlugin({
      filename: 'control/settings/templates/locationEditing.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/settings/templates/locationEditing.html'),
      chunks: ['devServer']
    }),
    new HtmlWebpackPlugin({
      filename: 'control/tests/index.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/tests/index.html'),
      chunks: ['devServer', 'control/tests/tests']
    }),
    new HtmlWebpackPlugin({
      filename: 'control/strings/index.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/strings/index.html'),
      chunks: ['devServer', 'control/strings/strings']
    }),
    new HtmlWebpackPlugin({
      filename: 'widget/index.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/widget/index.html'),
      chunks: ['devServer', 'widget/widget']
    }),
    new HtmlWebpackPlugin({
      filename: 'widget/templates/home.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/widget/templates/home.html'),
      chunks: ['devServer']
    }),
    new HtmlWebpackPlugin({
      filename: 'widget/templates/filter.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/widget/templates/filter.html'),
      chunks: ['devServer']
    }),
    new HtmlWebpackPlugin({
      filename: 'widget/templates/categories.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/widget/templates/categories.html'),
      chunks: ['devServer']
    }),
    new HtmlWebpackPlugin({
      filename: 'widget/templates/detail.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/widget/templates/detail.html'),
      chunks: ['devServer']
    }),
    new HtmlWebpackPlugin({
      filename: 'widget/templates/notificationForm.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/widget/templates/notificationForm.html'),
      chunks: ['devServer']
    }),
    new HtmlWebpackPlugin({
      filename: 'widget/templates/create.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/widget/templates/create.html'),
      chunks: ['devServer']
    }),
    new HtmlWebpackPlugin({
      filename: 'widget/templates/edit.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/widget/templates/edit.html'),
      chunks: ['devServer']
    }),
    new CopyWebpackPlugin([{
      from: path.join(__dirname, '../src/control'),
      to: path.join(__dirname, '../control'),
    }, {
      from: path.join(__dirname, '../src/widget'),
      to: path.join(__dirname, '../widget'),
    }, {
      from: path.join(__dirname, '../src/resources'),
      to: path.join(__dirname, '../resources'),
    }], {
      ignore: ['*.js', '*.html', '*.md']
    }),
    new CopyWebpackPlugin([{
      from: path.join(__dirname, '../../../styles'),
      to: path.join(__dirname, '../styles'),
    }, {
      from: path.join(__dirname, '../../../scripts'),
      to: path.join(__dirname, '../scripts'),
    }, {
      from: path.join(__dirname, '../../../fonticons'),
      to: path.join(__dirname, '../fonticons'),
    }])
  ],

  devServer: {
    port: 8080,
    host: '0.0.0.0',
    inline: true,
    contentBase: path.join(__dirname, '../dist'),
    publicPath: '/',
    quiet: false,
    noInfo: false,
    disableHostCheck: true,
  }

};

module.exports = WebpackConfig;
