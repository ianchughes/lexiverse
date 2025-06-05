
import type {NextConfig} from 'next';
import webpack from 'webpack'; // Import webpack

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: false, // Changed to false
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com', // Added for Firebase Storage images
        port: '',
        pathname: '/**',
      },
    ],
  },
  async headers() {
    return [
      {
        // Apply these headers to all routes in your application.
        source: '/:path*',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'clipboard-write=(self)',
          },
        ],
      },
    ];
  },
  webpack: (config, { isServer }) => {
    // Add IgnorePlugin for @opentelemetry/exporter-jaeger
    // This helps suppress "Module not found" warnings if Jaeger is not used.
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /@opentelemetry\/exporter-jaeger/,
      })
    );
    // You could add more IgnorePlugin instances for other optional OpenTelemetry exporters
    // if similar warnings appear for them (e.g., otlp-grpc, otlp-http).

    return config;
  },
};

export default nextConfig;
