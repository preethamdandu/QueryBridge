import { jwtVerify, importSPKI } from "jose";

export type AuthContext = {
  userId: string | null;
};

let cachedPublicKey: CryptoKey | null = null;

async function getPublicKey(): Promise<CryptoKey | null> {
  if (cachedPublicKey) {
    return cachedPublicKey;
  }

  const rawKey = process.env.JWT_PUBLIC_KEY;
  if (!rawKey || rawKey === "replace-with-public-key") {
    return null;
  }

  try {
    cachedPublicKey = await importSPKI(rawKey, "RS256") as CryptoKey;
    return cachedPublicKey;
  } catch {
    return null;
  }
}

export async function getAuthContext(authorizationHeader?: string): Promise<AuthContext> {
  if (!authorizationHeader) {
    return { userId: null };
  }

  if (!authorizationHeader.match(/^Bearer\s+/i)) {
    return { userId: null };
  }

  const token = authorizationHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { userId: null };
  }

  const publicKey = await getPublicKey();
  if (!publicKey) {
    if (process.env.NODE_ENV === "development" && token) {
      return { userId: "dev-user" };
    }
    return { userId: null };
  }

  try {
    const { payload } = await jwtVerify(token, publicKey, {
      algorithms: ["RS256"]
    });

    const sub = payload.sub;
    if (!sub) {
      return { userId: null };
    }

    return { userId: sub };
  } catch {
    return { userId: null };
  }
}
