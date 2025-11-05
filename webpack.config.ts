import path from 'path';
import { Configuration } from 'webpack';
import webpack from 'webpack';
import nodeExternals from 'webpack-node-externals';

const config: Configuration = {
  target: 'node',
  mode: 'production',
  entry: './src/index.ts',
  output: {
    path: path.resolve(process.cwd(), 'dist'),
    filename: 'index.js',
    clean: true,
  },
  resolve: {
    extensions: ['.ts', '.js'],
    modules: ['node_modules', 'src'],
  },
  externals: [nodeExternals({
    allowlist: [/@modelcontextprotocol\/.*/]
  })],
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new webpack.BannerPlugin({
      banner: '#!/usr/bin/env node',
      raw: true,
      entryOnly: true,
    }),
  ],
  optimization: {
    minimize: false, // Keep readable for debugging
  },
  devtool: 'source-map',
};

export default config;