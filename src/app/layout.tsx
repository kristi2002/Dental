import type { ReactNode } from 'react';
import './globals.css';

/**
 * The real `<html>` element lives in `app/[locale]/layout.tsx`, because only
 * there do we know which language to declare. This root layout is a passthrough.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
