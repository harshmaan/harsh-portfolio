import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ cookies, redirect }) => {
  cookies.delete("admin_auth", { path: "/" });
  return redirect("/login");
};
