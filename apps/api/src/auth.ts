import { createHash, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { FastifyReply, FastifyRequest } from "fastify";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const jwtSecret = new TextEncoder().encode(requiredEnv("JWT_SECRET"));
const appPassword = requiredEnv("APP_PASSWORD");

function sha256(value: string) {
  return createHash("sha256").update(value).digest();
}

export function passwordsMatch(candidate: string) {
  const left = sha256(candidate);
  const right = sha256(appPassword);
  return timingSafeEqual(left, right);
}

export async function signToken() {
  return new SignJWT({ sub: "owner" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(jwtSecret);
}

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, jwtSecret);
  return payload;
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "Não autenticado" });
  }

  try {
    await verifyToken(header.slice("Bearer ".length));
  } catch {
    return reply.code(401).send({ error: "Sessão inválida" });
  }
}
