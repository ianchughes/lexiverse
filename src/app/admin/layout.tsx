
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarTrigger,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarInset,
} from '@/components/ui/sidebar';
import { AdminNavItems } from '@/components/admin/AdminNavItems';
import { BookText, PanelLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Lexiverse - Admin Panel',
  description: 'Manage Lexiverse game.',
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider defaultOpen={true}>
      <Sidebar collapsible="icon" className="border-r hidden md:flex">
        <SidebarHeader className="flex items-center justify-between p-2">
          <Link href="/admin" className="flex items-center gap-2 p-2 font-headline text-lg font-bold text-primary">
            <BookText />
            <span className="group-data-[collapsible=icon]:hidden">Admin Panel</span>
          </Link>
          <SidebarTrigger className="group-data-[collapsible=icon]:hidden" />
        </SidebarHeader>
        <SidebarContent>
          <AdminNavItems />
        </SidebarContent>
        <SidebarFooter className="p-2 group-data-[collapsible=icon]:hidden">
          <p className="text-xs text-muted-foreground">Lexiverse Admin v1.0</p>
        </SidebarFooter>
      </Sidebar>
      
      {/* Mobile Sidebar (drawer style) */}
      <Sidebar variant="floating" collapsible="offcanvas" className="md:hidden">
         <SidebarHeader className="flex items-center justify-between p-2">
          <Link href="/admin" className="flex items-center gap-2 p-2 font-headline text-lg font-bold text-primary">
            <BookText />
            <span>Admin Panel</span>
          </Link>
          <SidebarTrigger />
        </SidebarHeader>
        <SidebarContent>
          <AdminNavItems />
        </SidebarContent>
         <SidebarFooter className="p-2">
          <p className="text-xs text-muted-foreground">Lexiverse Admin v1.0</p>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
          <SidebarTrigger className="md:hidden" />
          {/* Breadcrumbs or dynamic titles could go here */}
        </header>
        <main className="p-4 sm:px-6 sm:py-4 md:py-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

