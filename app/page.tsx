'use client';

import { useEffect, useRef, useState } from 'react';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // aborta requisição anterior (evita race-conditions)
  const abortRef = useRef<AbortController | null>(null);
  // debounce simples
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function generate() {
    if (!file || !caption.trim()) return;

    // cancela chamada anterior (se houver)
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('caption', caption);

      // opções padrão
      fd.append('output', 'webp');
      fd.append('fontSize', '22');
      fd.append('textColor', '#FFFFFF');
      fd.append('margin', '16');
      fd.append('outline', 'true');

      const res = await fetch('/api/caption', {
        method: 'POST',
        body: fd,
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Erro ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      // libera a URL anterior pra evitar leak
      setPreview(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.error(e);
        // opcional: você pode exibir um toast/alert aqui
      }
    } finally {
      setLoading(false);
    }
  }

  // dispara geração quando CAPTION muda (com debounce) e já existe arquivo
  useEffect(() => {
    if (!file) return;
    if (!caption.trim()) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      generate();
    }, 400); // debounce 400ms

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caption, file]);

  // também gera imediatamente quando selecionar arquivo, se já houver legenda
  useEffect(() => {
    if (file && caption.trim()) generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // cleanup de URL quando desmontar
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-start p-4 gap-4">
      <h2 className="text-lg">Adicione um texto à sua foto (render automático)</h2>

      <div className="flex flex-col gap-2 border border-amber-50 p-4 rounded-2xl w-full max-w-xl">
        <label className="w-full h-11 flex items-center justify-center bg-amber-50 rounded-full text-black px-4 cursor-pointer">
          <input
            name="file"
            type="file"
            accept="image/*"
            required
            className="w-full"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setFile(f ?? null);
            }}
          />
        </label>

        <div className="w-full h-11 flex items-center justify-center bg-amber-50 rounded-full text-black px-4">
          <input
            name="caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Escreva sua legenda (quebras com Enter serão respeitadas)"
            className="w-full bg-transparent outline-none"
            required
          />
        </div>

        {/* dica visual */}
        <div className="text-xs opacity-70">
          A imagem processa automaticamente assim que você escolhe o arquivo e digita a legenda.
        </div>
      </div>

      {loading && <div className="text-sm opacity-70">Processando…</div>}

      {preview && (
        <>
          <h3>Resultado da sua foto:</h3>
          <img src={preview} alt="resultado" className="max-w-full rounded-2xl" />
          <a
            href={preview}
            download="captioned.webp"
            className="w-48 h-11 flex items-center justify-center bg-amber-50 rounded-full text-black"
          >
            Baixar
          </a>
        </>
      )}
    </main>
  );
}
