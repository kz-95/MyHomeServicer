const PROXY_CONFIG = {
  '/api': {
    target: 'http://127.0.0.1:3000',
    secure: false,
    changeOrigin: true,
  },
  '/socket.io': {
    target: 'http://127.0.0.1:3000',
    secure: false,
    ws: true,
    changeOrigin: true,
    onError(err, req, res) {
      if (err.code === 'ECONNRESET') return;
      console.error('Proxy error:', err);
    },
  },
};

module.exports = PROXY_CONFIG;
