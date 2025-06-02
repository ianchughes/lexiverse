
import '@/app/globals.css';
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
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: 'Lexi Circles - Admin Panel',
  description: 'Manage Lexi Circles game.',
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased bg-background text-foreground">
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
              <p className="text-xs text-muted-foreground">Lexi Circles Admin v1.0</p>
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
              <p className="text-xs text-muted-foreground">Lexi Circles Admin v1.0</p>
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
        <Toaster />
      </body>
    </html>
  );
}
