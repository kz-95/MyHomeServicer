const PROXY_CONFIG = {
  '/api': {
    target: 'http://localhost:3000',
    secure: false,
    changeOrigin: true,
  },
  '/socket.io': {
    target: 'http://localhost:3000',
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
