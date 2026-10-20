import { afterEach, describe, expect, it } from "vitest";
import { ApiError, DcvClient } from "./client.js";
import { makeProject } from "../test/fakes.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function createHarness() {
  const calls: { url: string; init?: RequestInit }[] = [];
  let responder: () => Response = () => jsonResponse([makeProject()]);
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return responder();
  };
  const client = new DcvClient({ token: "tok", fetchImpl });
  return {
    client,
    calls,
    fetchImpl,
    respondWith(response: () => Response) {
      responder = response;
    }
  };
}

const originalToken = (globalThis as { __DCV_TOKEN__?: unknown }).__DCV_TOKEN__;

afterEach(() => {
  if (originalToken === undefined) {
    delete (globalThis as { __DCV_TOKEN__?: unknown }).__DCV_TOKEN__;
  } else {
    (globalThis as { __DCV_TOKEN__?: unknown }).__DCV_TOKEN__ = originalToken;
  }
});

describe("DcvClient", () => {
  it("envía el token y parsea la respuesta", async () => {
    const { client, calls } = createHarness();

    const projects = await client.listProjects();

    expect(projects).toHaveLength(1);
    expect(calls[0]!.url).toBe("/api/projects");
    expect(new Headers(calls[0]!.init!.headers).get("x-dcv-token")).toBe("tok");
  });

  it("usa el token inyectado en la página cuando no hay uno explícito", async () => {
    (globalThis as { __DCV_TOKEN__?: unknown }).__DCV_TOKEN__ = "inyectado";
    const { calls, fetchImpl } = createHarness();
    const injectedClient = new DcvClient({ fetchImpl });

    await injectedClient.listProjects();

    expect(new Headers(calls.at(-1)!.init!.headers).get("x-dcv-token")).toBe("inyectado");
  });

  it("convierte los errores del envelope en ApiError", async () => {
    const { client, respondWith } = createHarness();
    respondWith(() =>
      jsonResponse({ error: { code: "project_exists", message: "Duplicado" } }, 409)
    );

    await expect(client.importProject({ source: "local", location: "/tmp/x" })).rejects.toMatchObject({
      name: "ApiError",
      code: "project_exists",
      message: "Duplicado",
      status: 409
    });
  });

  it("maneja respuestas 204 y parámetros de rama", async () => {
    const { client, calls, respondWith } = createHarness();
    respondWith(() => new Response(null, { status: 204 }));

    await expect(client.deleteProject("p1")).resolves.toBeUndefined();
    expect(calls[0]!.init?.method).toBe("DELETE");

    respondWith(() => jsonResponse({ branch: "feature/x", commits: [] }));
    await client.listCommits("p1", "feature/x");
    expect(calls[1]!.url).toBe("/api/projects/p1/commits?branch=feature%2Fx");

    await client.getModel("p1", "abc", "main");
    expect(calls[2]!.url).toBe("/api/projects/p1/commits/abc/model?branch=main");
  });

  it("envía el cuerpo JSON de importación y actualización", async () => {
    const { client, calls } = createHarness();

    await client.importProject({ source: "url", location: "https://example.com/repo.git" });
    const importInit = calls[0]!.init!;
    expect(importInit.method).toBe("POST");
    expect(importInit.body).toBe(
      JSON.stringify({ source: "url", location: "https://example.com/repo.git" })
    );

    await client.updateProject("p1", { branch: "dev" });
    expect(calls[1]!.init?.method).toBe("PATCH");
    expect(calls[1]!.init?.body).toBe(JSON.stringify({ branch: "dev" }));
  });

  it("propaga ApiError desde un cuerpo no JSON", async () => {
    const { client, respondWith } = createHarness();
    respondWith(() => new Response("boom", { status: 500 }));

    await expect(client.listProjects()).rejects.toBeInstanceOf(ApiError);
  });
});
