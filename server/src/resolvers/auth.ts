import { SignJWT, importPKCS8 } from "jose";
import { createHash, randomBytes } from "node:crypto";
import { GraphQLError } from "graphql";
import type { GatewayContext } from "../context";

async function getPrivateKey() {
  const raw = process.env.JWT_PRIVATE_KEY;
  if (!raw || raw === "replace-with-private-key") {
    return null;
  }
  return importPKCS8(raw, "RS256");
}

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

function generateRefreshToken(): string {
  return randomBytes(48).toString("hex");
}

async function issueTokens(userId: string) {
  const privateKey = await getPrivateKey();

  let accessToken: string;
  if (privateKey) {
    accessToken = await new SignJWT({ sub: userId })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(privateKey);
  } else {
    accessToken = `dev-token-${userId}-${Date.now()}`;
  }

  const refreshToken = generateRefreshToken();
  return { accessToken, refreshToken };
}

export const authResolvers = {
  register: async (
    _: unknown,
    args: { input: { email: string; password: string } },
    context: GatewayContext
  ) => {
    const existing = await context.prisma.user.findUnique({
      where: { email: args.input.email }
    });

    if (existing) {
      throw new GraphQLError("Email already registered", {
        extensions: { code: "CONFLICT" }
      });
    }

    const user = await context.prisma.user.create({
      data: {
        email: args.input.email,
        password: hashPassword(args.input.password)
      }
    });

    const tokens = await issueTokens(user.id);

    await context.prisma.session.create({
      data: {
        userId: user.id,
        refreshToken: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    return tokens;
  },

  login: async (
    _: unknown,
    args: { input: { email: string; password: string } },
    context: GatewayContext
  ) => {
    const user = await context.prisma.user.findUnique({
      where: { email: args.input.email }
    });

    if (!user || user.password !== hashPassword(args.input.password)) {
      throw new GraphQLError("Invalid credentials", {
        extensions: { code: "UNAUTHENTICATED" }
      });
    }

    const tokens = await issueTokens(user.id);

    await context.prisma.session.create({
      data: {
        userId: user.id,
        refreshToken: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    return tokens;
  },

  refreshToken: async (
    _: unknown,
    args: { refreshToken: string },
    context: GatewayContext
  ) => {
    const session = await context.prisma.session.findUnique({
      where: { refreshToken: args.refreshToken }
    });

    if (!session || session.revoked || session.expiresAt < new Date()) {
      throw new GraphQLError("Invalid or expired refresh token", {
        extensions: { code: "UNAUTHENTICATED" }
      });
    }

    await context.prisma.session.update({
      where: { id: session.id },
      data: { revoked: true }
    });

    const tokens = await issueTokens(session.userId);

    await context.prisma.session.create({
      data: {
        userId: session.userId,
        refreshToken: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    return tokens;
  },

  revokeSession: async (
    _: unknown,
    args: { sessionId: string },
    context: GatewayContext
  ) => {
    await context.prisma.session.updateMany({
      where: { id: args.sessionId, userId: context.userId ?? "" },
      data: { revoked: true }
    });
    return true;
  }
};
