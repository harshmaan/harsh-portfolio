import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const formData = await request.formData();
  const id = formData.get("id");
  const password = formData.get("password");

  const expectedId = import.meta.env.ADMIN_ID;
  const expectedPassword = import.meta.env.ADMIN_PASSWORD;

  if (id === expectedId && password === expectedPassword) {
    // Set cookie valid for 1 day
    cookies.set("admin_auth", "true", {
      httpOnly: true,
      path: "/",
      maxAge: 60 * 15,
      secure: import.meta.env.PROD, // secure only in production
    });

    return redirect("/admin");
  }

  // Invalid login, redirect back to login with error param
  return redirect("/login?error=1");
};
