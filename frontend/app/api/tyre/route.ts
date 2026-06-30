import { NextResponse } from 'next/server';
import fs from 'fs';

export async function GET() {
  try {
    const filePath = String.raw`C:\Users\Dell\.gemini\antigravity\brain\f8c67b1d-d520-4354-a615-56a48686a099\f1_slick_tyre_1782383356064.png`;
    const imageBuffer = fs.readFileSync(filePath);
    return new NextResponse(imageBuffer, {
      headers: { 
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000'
      },
    });
  } catch (error) {
    return new NextResponse('Image not found', { status: 404 });
  }
}
