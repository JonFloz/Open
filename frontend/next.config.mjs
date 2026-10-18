/** @type {import('next').NextConfig} */
const nextConfig = {
  // Exportación estática: el backend Express sirve `frontend/out` en el mismo
  // servicio de Render (un único Web Service, como pide el plan).
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
};

export default nextConfig;
