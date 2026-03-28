/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Prevent pdfjs-dist from attempting to import the Node.js 'canvas'
    // package when bundled for the browser — it doesn't exist there.
    config.resolve.alias.canvas = false
    config.resolve.alias.encoding = false
    return config
  },
}

module.exports = nextConfig
