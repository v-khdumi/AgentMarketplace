import "next-auth";

declare module "next-auth" {
  interface Session {
    error?: string;
    user?: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      isAdmin?: boolean;
      tenantId?: string;
      groups?: string[];
      roles?: string[];
      guest?: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    objectId?: string;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    identityExpires?: number;
    error?: string;
    guest?: boolean;
    tenantId?: string;
    groups?: string[];
    roles?: string[];
  }
}
