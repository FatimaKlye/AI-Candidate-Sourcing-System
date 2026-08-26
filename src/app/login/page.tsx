import { AuthLayout } from "@/components/auth/AuthLayout";
import { LoginForm } from "@/components/auth/LoginForm";

interface LoginPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to continue sourcing candidates."
    >
      <LoginForm initialError={params.error} />
    </AuthLayout>
  );
}
