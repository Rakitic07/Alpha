import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  const job = await prisma.job.findFirst({
    where: { type: 'screener-sync' },
    orderBy: { createdAt: 'desc' },
  });

  if (!job) {
    return NextResponse.json({ progress: 0, message: null, status: 'IDLE' });
  }

  return NextResponse.json({
    progress: job.progress,
    message: job.message,
    status: job.status,
  });
}
