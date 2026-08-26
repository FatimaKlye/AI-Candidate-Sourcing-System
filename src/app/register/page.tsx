import { redirect } from "next/navigation";

export default function RegisterPage() {
  redirect("/login?error=Access+is+invitation-only.+Contact+your+organization+for+an+HR+account.");
}
