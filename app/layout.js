import '../src/styles.css';

export const metadata = {
  title: 'AuraFlow - Omnichannel Revenue OS',
  description:
    'Premium omnichannel CRM, AI support, sales automation, and workflow orchestration for modern businesses.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
