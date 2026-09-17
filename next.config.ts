import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Ir e voltar entre telas fica instantâneo; quem grava chama revalidatePath.
    staleTimes: { dynamic: 30, static: 180 },
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
