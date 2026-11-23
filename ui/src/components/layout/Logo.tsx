import { Link } from 'react-router-dom';
import { APP_NAME } from '@/lib/constants';

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 rounded-md">
      <img src="/favicon.svg" alt="" className="h-8 w-8" />
      <span className="font-display text-[17px] font-bold tracking-tight">{APP_NAME}</span>
    </Link>
  );
}
