import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Padrão do Next é 1MB, mais restritivo que o limite de 2MB já
      // combinado no upload de avatar (ver AVATAR_MAX_BYTES em
      // lib/users/actions.ts e superadmin/accounts/[id]/actions.ts) — 3MB
      // dá margem pro overhead do multipart/form-data em cima do arquivo.
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
