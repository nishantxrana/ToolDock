import { Navigate, useNavigate } from 'react-router-dom';
import { ConnectForm } from './ConnectForm';
import { useSessionStore } from '@/store/sessionStore';

export function ConnectPage() {
  const isConnected = useSessionStore((s) => s.isConnected);
  const navigate = useNavigate();

  // Already connected - no need to be here
  if (isConnected) return <Navigate to="/" replace />;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-8 sm:py-14">
      <ConnectForm onConnected={() => navigate('/', { replace: true })} />
    </div>
  );
}
