'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Bell, UserCircle } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/notifications', label: 'Alerts', icon: Bell },
  { href: '/profile', label: 'Profile', icon: UserCircle },
];

export function BottomNav() {
  const isMobile = useIsMobile();
  const pathname = usePathname();

  if (!isMobile) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-around border-t bg-background py-2">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className="flex flex-col items-center text-xs">
          <Icon
            className={cn(
              'h-5 w-5',
              pathname === href ? 'text-primary' : 'text-muted-foreground'
            )}
          />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

