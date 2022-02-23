module.exports = {
  transpileDependencies: true,
  devServer: {
    proxy: {
      '/api': {
        target: 'url',
        changeOrigin: true,
        pathRewrite: {
          '^/api': ''
        }
      }
    },
    // 此处开启 https
    https: true
  }
}
