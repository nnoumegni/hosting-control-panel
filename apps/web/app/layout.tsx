import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { AppProviders } from '../components/providers';
import { ApiEndpointBanner } from '../components/api-endpoint-banner';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Hosting Control Panel',
  description: 'Modern alternative to cPanel/WHM for EC2 hosting environments.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <AppProviders>
          <div className="min-h-screen bg-slate-950/95">
            <ApiEndpointBanner />
            {children}
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
