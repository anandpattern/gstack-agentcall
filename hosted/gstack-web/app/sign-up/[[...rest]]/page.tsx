import { redirect } from "next/navigation";

// Google sign-in handles new and returning users identically, so there's no
// separate sign-up flow — send everyone to /sign-in (which offers Google).
export default function SignUpPage() {
  redirect("/sign-in");
}
