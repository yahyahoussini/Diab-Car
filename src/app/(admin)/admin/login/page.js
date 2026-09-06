import LoginForm from '@/components/admin/LoginForm';
import { dataMode } from '@/lib/data';

export const metadata = { title: 'Connexion' };

export default async function LoginPage({ searchParams }) {
  const { next } = await searchParams;
  return <LoginForm next={next || ''} mode={dataMode()} />;
}
