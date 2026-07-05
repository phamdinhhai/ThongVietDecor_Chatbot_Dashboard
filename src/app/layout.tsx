import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Chatbot Dashboard — Analytics & Orders',
  description: 'Dashboard quản lý chatbot, đơn hàng, khách hàng và phân tích hiệu suất bán hàng qua Facebook Messenger.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className="antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen bg-surface-50">{children}</body>
    </html>
  );
}
