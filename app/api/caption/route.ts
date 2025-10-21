// app/api/caption/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CaptionOpts = {
  caption: string;
  fontSize: number;
  textColor: string;
  margin: number;
  fontFamily: string;
  withOutline?: boolean;
  output: 'webp' | 'jpeg' | 'png';
  quality: number;
};

function escapeXML(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function wrapCaption(text: string, maxWidthPx: number, fontSize: number) {
  const avgChar = fontSize * 0.6;
  const maxChars = Math.max(1, Math.floor(maxWidthPx / avgChar));
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length <= maxChars) line = (line ? line + ' ' : '') + w;
    else {
      if (line) lines.push(line);
      if (w.length > maxChars) {
        for (let i = 0; i < w.length; i += maxChars) lines.push(w.slice(i, i + maxChars));
        line = '';
      } else line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// gera SVG apenas com <text> (sem retângulo de fundo)
function buildCaptionSVG(
  imgWidth: number,
  imgHeight: number,
  opts: Omit<CaptionOpts, 'output' | 'quality'>
) {
  const { caption, fontSize, textColor, margin, fontFamily, withOutline = false } = opts;

  const maxWidth = Math.floor(imgWidth * 0.7);
  const lines = wrapCaption(caption, maxWidth, fontSize);
  const lineHeight = Math.floor(fontSize * 1.35);

  // baseline da primeira linha de baixo pra cima
  const x = margin;
  const yFirstBaseline = imgHeight - margin - (lines.length - 1) * lineHeight;

  const tspans = lines
    .map((line, i) => {
      const dy = i === 0 ? 0 : lineHeight;
      return `<tspan x="${x}" dy="${dy}">${escapeXML(line)}</tspan>`;
    })
    .join('');

  const strokeAttrs = withOutline
    ? ` stroke="black" stroke-width="${Math.max(1, Math.round(fontSize * 0.06))}" paint-order="stroke" `
    : '';

  const svg = `
<svg width="${imgWidth}" height="${imgHeight}" viewBox="0 0 ${imgWidth} ${imgHeight}" xmlns="http://www.w3.org/2000/svg">
  <text x="${x}" y="${yFirstBaseline}"
        font-family="${fontFamily}" font-size="${fontSize}" fill="${textColor}" ${strokeAttrs}
        xml:space="preserve">${tspans}</text>
</svg>`.trim();

  return Buffer.from(svg);
}

export async function POST(req: Request) {
  const sharp = (await import('sharp')).default;

  const form = await req.formData();
  const file = form.get('file') as File | null;
  const captionRaw = (form.get('caption') as string | null) ?? '';

  if (!file) return NextResponse.json({ error: 'file é obrigatório' }, { status: 400 });
  if (!captionRaw.trim()) return NextResponse.json({ error: 'caption é obrigatório' }, { status: 400 });

  // opções
const fontSize = Number(form.get('fontSize') ?? 22);
  const textColor = (form.get('textColor') as string) ?? '#FFFFFF';
const margin = Number(form.get('margin') ?? 16);
  const fontFamily =
    (form.get('fontFamily') as string) ?? 'DejaVu Sans, Arial, Helvetica, sans-serif';
  const withOutline = String(form.get('outline') ?? 'true') === 'true'; // contorno leve por padrão
  const output = ((form.get('output') as string) ?? 'webp').toLowerCase() as CaptionOpts['output'];
  const quality = Number(form.get('quality') ?? 92);

  const buf = Buffer.from(await file.arrayBuffer());

  const base = sharp(buf, { failOnError: false }).rotate();
  const meta = await base.metadata();
  if (!meta.width || !meta.height) {
    return NextResponse.json({ error: 'Não foi possível ler dimensões da imagem' }, { status: 400 });
  }

  const svg = buildCaptionSVG(meta.width, meta.height, {
    caption: captionRaw.trim(),
    fontSize,
    textColor,
    margin,
    fontFamily,
    withOutline,
  });

  let pipeline = base.composite([{ input: svg }]);
  let contentType = 'image/webp';

  if (output === 'jpeg') {
    pipeline = pipeline.jpeg({ quality, mozjpeg: true });
    contentType = 'image/jpeg';
  } else if (output === 'png') {
    pipeline = pipeline.png();
    contentType = 'image/png';
  } else {
    pipeline = pipeline.webp({ quality });
  }

  const out = await pipeline.toBuffer();
  return new NextResponse(out, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="captioned.${output === 'jpeg' ? 'jpg' : output}"`,
      'Cache-Control': 'no-store',
    },
  });
}
