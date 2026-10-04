import type { Metadata } from 'next';
import Link from 'next/link';
import localFont from 'next/font/local';
const sans = localFont({ src: '../fonts/inter-latin.woff2', variable: '--font-sans', display: 'swap' });
const mono = localFont({ src: '../fonts/jetbrains-mono-latin.woff2', variable: '--font-mono', display: 'swap' });
import './globals.css';

export const metadata: Metadata = {
  title: 'HBAR Invoices', description: 'A USD-reference HBAR invoice developer template for Hedera testnet.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`${sans.variable} ${mono.variable}`}><body>
    <header className="header"><Link href="/" className="wordmark">HBAR Invoices<span className="brand-dot" aria-hidden="true" /></Link>
      <nav aria-label="Main navigation"><Link href="/setup">Setup guide</Link><span className="network">Hedera testnet</span></nav>
    </header>
    <main id="main">{children}</main>
    <footer>Educational developer template · MIT · Local checks and testnet configuration are separate.</footer>
  </body></html>;
}
