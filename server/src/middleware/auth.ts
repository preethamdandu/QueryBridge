export type AuthContext = {
  userId: string | null;
};

export function getAuthContext(authorizationHeader?: string): AuthContext {
  if (!authorizationHeader) {
    return { userId: null };
  }

  // Placeholder parser until auth-service integration is wired.
  const token = authorizationHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { userId: null };
  }

  return { userId: "dev-user" };
}
