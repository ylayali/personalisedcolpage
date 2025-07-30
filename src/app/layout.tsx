import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

const geistSans = Geist({
    variable: '--font-geist-sans',
    subsets: ['latin']
});

const geistMono = Geist_Mono({
    variable: '--font-geist-mono',
    subsets: ['latin']
});

export const metadata: Metadata = {
    title: 'Personalised Coloring Page Generator',
    description: 'Create personalized coloring pages from your photos. Upload a picture and transform it into beautiful coloring pages for kids and adults.',
    icons: {
        icon: '/favicon.svg'
    }
};

export default function RootLayout({
    children
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang='en' suppressHydrationWarning>
            <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
                <ThemeProvider attribute='class' defaultTheme='dark' enableSystem={false} disableTransitionOnChange>
                    {children}
                </ThemeProvider>
            </body>
        </html>
    );
}
