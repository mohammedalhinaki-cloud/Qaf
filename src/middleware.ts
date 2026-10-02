import { NextResponse, type NextRequest } from 'next/server';

/**
 * يحافظ على فصل حُجَّة عن النطاق الأساسي maaoun.com عند استخدام Cloudflare.
 * النطاق الأساسي لا يُعاد توجيهه إلى التطبيق ولا يُستخدم كعنوان canonical.
 */
export function middleware(request: NextRequest) {
  const host = (request.headers.get('host') || '').split(':')[0].toLowerCase();
  const allowed =
    host === 'hujjah.maaoun.com' ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.pages.dev') ||
    host.endsWith('.workers.dev');

  if (!allowed) {
    return new NextResponse('Not Found', { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
