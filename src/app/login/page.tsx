import { AuthLayout } from "@/components/auth/AuthLayout";
import { LoginForm } from "@/components/auth/LoginForm";

interface LoginPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <AuthLayout
      title="Private HR sign in"
      subtitle="Use your organization-approved account to continue."
    >
      <LoginForm initialError={params.error} />
    </AuthLayout>
  );
}
