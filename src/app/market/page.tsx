'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function MarketRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/');
    setTimeout(() => {
      document.getElementById('market-overview')?.scrollIntoView({ behavior: 'smooth' });
    }, 500);
  }, [router]);
  return null;
}
