import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { passwordsMatch, requireAuth, signToken } from "./auth.js";
import { migrate, pool, waitForDatabase } from "./db.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const port = Number(process.env.PORT) || 4000;

const app = Fastify({
  logger: true,
  bodyLimit: 50 * 1024 * 1024,
});

function isAllowedOrigin(origin: string) {
  const extra = process.env.FRONTEND_URL;
  return (
    origin === "http://localhost:3000" ||
    origin === extra ||
    origin.endsWith(".vercel.app")
  );
}

await app.register(cors, {
  origin: (origin, callback) => {
    if (!origin || isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

await app.register(rateLimit, {
  max: 120,
  timeWindow: "1 minute",
});

app.get("/health", async () => ({ ok: true }));

app.post(
  "/auth/login",
  {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: "1 minute",
      },
    },
  },
  async (request, reply) => {
    const body = request.body as { password?: string } | undefined;
    const password = body?.password ?? "";
    if (!passwordsMatch(password)) {
      return reply.code(401).send({ error: "Senha incorreta" });
    }
    const token = await signToken();
    return { token };
  },
);

app.get("/auth/me", { preHandler: requireAuth }, async () => ({
  ok: true,
  user: "owner",
}));

app.get("/drawings", { preHandler: requireAuth }, async () => {
  const result = await pool.query<{
    id: string;
    name: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `select id, name, created_at, updated_at
     from drawings
     order by updated_at desc`,
  );

  return {
    drawings: result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
});

app.post("/drawings", { preHandler: requireAuth }, async (request) => {
  const body = request.body as { name?: string } | undefined;
  const name = (body?.name ?? "Sem título").trim() || "Sem título";
  const result = await pool.query<{
    id: string;
    name: string;
    data: unknown;
    created_at: Date;
    updated_at: Date;
  }>(
    `insert into drawings (name)
     values ($1)
     returning id, name, data, created_at, updated_at`,
    [name],
  );
  const row = result.rows[0];
  return {
    drawing: {
      id: row.id,
      name: row.name,
      data: row.data,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  };
});

app.get("/drawings/:id", { preHandler: requireAuth }, async (request, reply) => {
  const { id } = request.params as { id: string };
  if (!UUID_RE.test(id)) {
    return reply.code(400).send({ error: "ID inválido" });
  }

  const result = await pool.query<{
    id: string;
    name: string;
    data: unknown;
    created_at: Date;
    updated_at: Date;
  }>(
    `select id, name, data, created_at, updated_at
     from drawings
     where id = $1`,
    [id],
  );

  if (result.rowCount === 0) {
    return reply.code(404).send({ error: "Desenho não encontrado" });
  }

  const row = result.rows[0];
  return {
    drawing: {
      id: row.id,
      name: row.name,
      data: row.data,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  };
});

app.put("/drawings/:id", { preHandler: requireAuth }, async (request, reply) => {
  const { id } = request.params as { id: string };
  if (!UUID_RE.test(id)) {
    return reply.code(400).send({ error: "ID inválido" });
  }

  const body = request.body as { name?: string; data?: unknown } | undefined;
  const fields: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  if (typeof body?.name === "string") {
    const name = body.name.trim() || "Sem título";
    fields.push(`name = $${index++}`);
    values.push(name);
  }

  if (body?.data !== undefined) {
    fields.push(`data = $${index++}::jsonb`);
    values.push(JSON.stringify(body.data));
  }

  if (fields.length === 0) {
    return reply.code(400).send({ error: "Nada para atualizar" });
  }

  fields.push("updated_at = now()");
  values.push(id);

  const result = await pool.query<{
    id: string;
    name: string;
    data: unknown;
    created_at: Date;
    updated_at: Date;
  }>(
    `update drawings
     set ${fields.join(", ")}
     where id = $${index}
     returning id, name, data, created_at, updated_at`,
    values,
  );

  if (result.rowCount === 0) {
    return reply.code(404).send({ error: "Desenho não encontrado" });
  }

  const row = result.rows[0];
  return {
    drawing: {
      id: row.id,
      name: row.name,
      data: row.data,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  };
});

app.delete(
  "/drawings/:id",
  { preHandler: requireAuth },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!UUID_RE.test(id)) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const result = await pool.query(`delete from drawings where id = $1`, [id]);
    if (result.rowCount === 0) {
      return reply.code(404).send({ error: "Desenho não encontrado" });
    }

    return { ok: true };
  },
);

app.get("/library", { preHandler: requireAuth }, async () => {
  const result = await pool.query<{ value: unknown }>(
    `select value from settings where key = 'library'`,
  );
  return { libraryItems: result.rows[0]?.value ?? [] };
});

app.put("/library", { preHandler: requireAuth }, async (request) => {
  const body = request.body as { libraryItems?: unknown } | undefined;
  const libraryItems = body?.libraryItems ?? [];
  await pool.query(
    `insert into settings (key, value)
     values ('library', $1::jsonb)
     on conflict (key) do update set value = excluded.value`,
    [JSON.stringify(libraryItems)],
  );
  return { ok: true };
});

try {
  await waitForDatabase();
  await migrate();
  await app.listen({ port, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
