import {NextRequest,NextResponse} from 'next/server';
// Preserve emergency demo sources for review, but remove simulated APIs from the usable product.
export function middleware(request:NextRequest){
  if(!request.nextUrl.pathname.startsWith('/api/'))return NextResponse.redirect(new URL((request.nextUrl.pathname==='/login'?'/signup':request.nextUrl.pathname==='/passport'?'/lookup':'/')+request.nextUrl.search,request.url));
  if(!request.nextUrl.pathname.startsWith('/api/app/'))return NextResponse.json(
    {error:'LEGACY_DEMO_ISOLATED',message:'Use the connected application at /.'},{status:410});
  return NextResponse.next();
}
export const config={matcher:['/api/:path*','/bind','/consent','/dev','/forge','/live','/login','/passport','/proof','/record','/role','/show','/verify']};
