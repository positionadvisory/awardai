/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      // Serve the FAQ HTML at /faq without the .html extension
      { source: '/faq', destination: '/faq.html' },
      // Serve the TNO report at /tno-report without the .html extension
      { source: '/tno-report', destination: '/tno-report.html' },
    ]
  },
  webpack: (config) => {
    // Prevent pdfjs-dist from attempting to import the Node.js 'canvas'
    // package when bundled for the browser — it doesn't exist there.
    config.resolve.alias.canvas = false
    config.resolve.alias.encoding = false
    return config
  },
}

module.exports = nextConfig
