import { defineMiddleware } from "astro/middleware";

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);

  if (url.pathname.startsWith("/admin")) {
    const authHeader = context.request.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Basic ")) {
      return new Response("Access Denied", { status: 403 });
    }

    const base64Credentials = authHeader.split(" ")[1];
    const decoded = atob(base64Credentials);
    const [inputId, inputPassword] = decoded.split(":");

    const expectedId = import.meta.env.ADMIN_ID;
    const expectedPassword = import.meta.env.ADMIN_PASSWORD;

    if (inputId !== expectedId || inputPassword !== expectedPassword) {
      return new Response("Access Denied", { status: 403 });
    }
  }

  return next();
});
