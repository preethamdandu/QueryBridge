import DataLoader from "dataloader";
import type { PrismaClient, User, Session } from "@prisma/client";

export function createUserLoader(prisma: PrismaClient) {
  return new DataLoader<string, User | null>(async (ids) => {
    const users = await prisma.user.findMany({
      where: { id: { in: [...ids] } }
    });

    const userMap = new Map(users.map((u) => [u.id, u]));
    return ids.map((id) => userMap.get(id) ?? null);
  });
}

export function createSessionLoader(prisma: PrismaClient) {
  return new DataLoader<string, Session[]>(async (userIds) => {
    const sessions = await prisma.session.findMany({
      where: { userId: { in: [...userIds] }, revoked: false }
    });

    const sessionMap = new Map<string, Session[]>();
    for (const session of sessions) {
      const existing = sessionMap.get(session.userId) ?? [];
      existing.push(session);
      sessionMap.set(session.userId, existing);
    }

    return userIds.map((id) => sessionMap.get(id) ?? []);
  });
}

export type Loaders = {
  userLoader: ReturnType<typeof createUserLoader>;
  sessionLoader: ReturnType<typeof createSessionLoader>;
};

export function createLoaders(prisma: PrismaClient): Loaders {
  return {
    userLoader: createUserLoader(prisma),
    sessionLoader: createSessionLoader(prisma)
  };
}
