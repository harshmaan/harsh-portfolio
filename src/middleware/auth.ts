import { defineMiddleware } from "astro/middleware";

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);

  if (url.pathname.startsWith("/admin")) {
    const isAuthed = context.cookies.get("admin_auth")?.value === "true";

    if (!isAuthed) {
      return context.redirect("/login");
    }
  }

  return next();
});
