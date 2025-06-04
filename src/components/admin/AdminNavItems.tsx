
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarDays,
  SpellCheck,
  Users,
  UsersRound,
  BarChart3,
  Settings,
  History,
  MailCheck,
  Lightbulb, // Changed icon for Suggestions
} from 'lucide-react';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/puzzles', label: 'Puzzles', icon: CalendarDays },
  { href: '/admin/words', label: 'Words', icon: SpellCheck },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/circles', label: 'Circles', icon: UsersRound },
  { href: '/admin/invites', label: 'Invites', icon: MailCheck },
  { href: '/admin/suggestions', label: 'Suggestions', icon: Lightbulb }, // New Suggestions Link
  { href: '/admin/stats', label: 'Statistics', icon: BarChart3 },
  { href: '/admin/config', label: 'Configuration', icon: Settings },
  { href: '/admin/audit', label: 'Audit Logs', icon: History },
];

export function AdminNavItems() {
  const pathname = usePathname();

  return (
    <SidebarMenu>
      {navItems.map((item) => (
        <SidebarMenuItem key={item.href}>
          <SidebarMenuButton
            asChild
            isActive={pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href))}
            className={cn(
              (pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href))) && '!bg-primary/10 !text-primary'
            )}
            tooltip={{ children: item.label, className: "bg-popover text-popover-foreground border shadow-md" }}
          >
            <Link href={item.href}>
              <item.icon />
              <span>{item.label}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

    