const path = require('path');
var webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const ZipWebpackPlugin = require('zip-webpack-plugin');
const ExtractTextPlugin = require('extract-text-webpack-plugin');

const WebpackConfig = {

  // Disable source maps on production builds
  devtool: false,

  entry: {
    // Plugin entry points
    'control/content/content': path.join(__dirname, '../src/control/content/content.js'),
    'control/design/design': path.join(__dirname, '../src/control/design/design.js'),
    'control/settings/settings': path.join(__dirname, '../src/control/settings/settings.js'),
    'control/tests/tests': path.join(__dirname, '../src/control/tests/tests.js'),
    'control/strings/strings': path.join(__dirname, '../src/control/strings/strings.js'),
    'widget/widget': path.join(__dirname, '../src/widget/widget.js'),
  },

  output: {
    path: path.join(__dirname, '../dist'),
    filename: '[name].js'
  },

  externals: {
    buildfire: 'buildfire'
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
        use: ExtractTextPlugin.extract({
            fallback: 'style-loader',
            use: {loader: 'css-loader', options: {minimize: true}}
        })
      }
    ]
  },

  plugins: [
    new webpack.optimize.UglifyJsPlugin(),
    new HtmlWebpackPlugin({
      filename: 'control/content/index.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/content/index.html'),
      chunks: ['control/content/content']
    }),
    new HtmlWebpackPlugin({
      filename: 'control/design/index.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/design/index.html'),
      chunks: ['control/design/design']
    }),
    new HtmlWebpackPlugin({
      filename: 'control/settings/index.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/settings/index.html'),
      chunks: ['control/settings/settings']
    }),
    new HtmlWebpackPlugin({
      filename: 'control/settings/templates/globalSettings.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/settings/templates/globalSettings.html'),
    }),
    new HtmlWebpackPlugin({
      filename: 'control/settings/templates/sorting.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/settings/templates/sorting.html'),
    }),
    new HtmlWebpackPlugin({
      filename: 'control/settings/templates/filtering.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/settings/templates/filtering.html'),
    }),
    new HtmlWebpackPlugin({
      filename: 'control/settings/templates/map.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/settings/templates/map.html'),
    }),
    new HtmlWebpackPlugin({
      filename: 'control/settings/templates/bookmarks.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/settings/templates/bookmarks.html'),
    }),
    new HtmlWebpackPlugin({
      filename: 'control/settings/templates/globalEditing.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/settings/templates/globalEditing.html'),
    }),
    new HtmlWebpackPlugin({
      filename: 'control/settings/templates/globalEntries.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/settings/templates/globalEntries.html'),
    }),
    new HtmlWebpackPlugin({
      filename: 'control/settings/templates/locationEditing.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/settings/templates/locationEditing.html')
    }),
    new HtmlWebpackPlugin({
      filename: 'widget/index.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/widget/index.html'),
      chunks: ['widget/widget']
    }),
    new HtmlWebpackPlugin({
      filename: 'widget/templates/filter.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/widget/templates/filter.html')
    }),
    new HtmlWebpackPlugin({
      filename: 'widget/templates/categories.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/widget/templates/categories.html')
    }),
    new HtmlWebpackPlugin({
      filename: 'widget/templates/detail.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/widget/templates/detail.html')
    }),
    new HtmlWebpackPlugin({
      filename: 'widget/templates/notificationForm.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/widget/templates/notificationForm.html')
    }),
    new HtmlWebpackPlugin({
      filename: 'widget/templates/edit.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/widget/templates/edit.html')
    }),
    new HtmlWebpackPlugin({
      filename: 'widget/templates/create.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/widget/templates/create.html')
    }),
    new HtmlWebpackPlugin({
      filename: 'widget/templates/edit.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/widget/templates/edit.html')
    }),
    new HtmlWebpackPlugin({
      filename: 'widget/templates/home.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/widget/templates/home.html')
    }),
    new HtmlWebpackPlugin({
      filename: 'control/content/templates/categories.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/content/templates/categories.html'),
    }),
    new HtmlWebpackPlugin({
      filename: 'control/content/templates/locations.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/content/templates/locations.html'),
    }),
    new HtmlWebpackPlugin({
      filename: 'control/content/templates/listView.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/content/templates/listView.html'),
    }),
    new HtmlWebpackPlugin({
      filename: 'control/tests/index.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/tests/index.html'),
      chunks: ['control/tests/tests']
    }),
    new HtmlWebpackPlugin({
      filename: 'control/strings/index.html',
      inject: true,
      minify: { removeComments: true, collapseWhitespace: true },
      template: path.join(__dirname, '../src/control/strings/index.html'),
      chunks: ['control/strings/strings']
    }),
    new CopyWebpackPlugin([{
      from: path.join(__dirname, '../src/control'),
      to: path.join(__dirname, '../dist/control'),
    }, {
      from: path.join(__dirname, '../src/widget'),
      to: path.join(__dirname, '../dist/widget'),
    }, {
      from: path.join(__dirname, '../src/resources'),
      to: path.join(__dirname, '../dist/resources'),
    }, {
      from: path.join(__dirname, '../plugin.json'),
      to: path.join(__dirname, '../dist/plugin.json'),
    }
    ], {
      ignore: ['*.js', '*.html', '*.md']
    }),
    new ExtractTextPlugin('[name].css'),
    new ZipWebpackPlugin({
      path: path.join(__dirname, '../'),
      filename: `plugin.zip`
    })
  ]

};

module.exports = WebpackConfig;
