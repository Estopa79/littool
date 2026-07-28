// Phase 6, Paket 2: Ein-Klick-Uebernahme eines OpenAlex-Treffers in den
// Eingang/Pruef-Pool (Paket E, status='triage') - laeuft danach durch dieselbe
// Schnell-Einschaetzung/Uebernahme/Verwerfen-Infrastruktur wie ein normaler
// PDF-Upload in den Eingang. Open-Access-PDF wird, wo verfuegbar, direkt
// serverseitig geladen (Deno fetch, kein CORS-Problem wie im Browser) und in
// denselben "pdfs"-Bucket wie normale Quellen abgelegt; ohne OA-PDF bleibt
// storage_path leer ("kein PDF", vom Frontend entsprechend gekennzeichnet).

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

type ImportAuthor = { given: string; family: string };
type ImportPayload = {
  openalex_id?: string;
  doi?: string | null;
  title?: string;
  authors?: ImportAuthor[];
  year?: number | null;
  venue?: string | null;
  citation_count?: number | null;
  abstract?: string | null;
  type?: string | null;
  oa_pdf_url?: string | null;
};

// Sicherheits-Fix: die PDF-URL wird NICHT aus dem Client-Payload uebernommen
// (ein authentifizierter Aufrufer koennte sonst eine beliebige URL angeben und
// die Function als Server-Side-Request-Forgery-Proxy missbrauchen - fetch()
// serverseitig wuerde jede erreichbare Adresse anfragen, nicht nur echte
// OpenAlex-PDF-Links). Stattdessen wird der Datensatz per `openalex_id`
// erneut direkt bei OpenAlex abgerufen und NUR die dort tatsaechlich
// hinterlegte `best_oa_location.pdf_url` verwendet - der Client liefert die
// uebrigen Metadaten (Titel/Autoren/...) weiterhin mit, um keinen zweiten
// vollen Parse-Durchlauf zu erzwingen; diese Felder werden nur gespeichert,
// nie ausgefuehrt oder angefragt, daher unkritisch.
async function fetchTrustedOaPdfUrl(openalexId: string | undefined): Promise<string | null> {
  if (!openalexId) return null;
  const mailto = Deno.env.get("OPENALEX_MAILTO");
  const url = `https://api.openalex.org/works/${encodeURIComponent(openalexId)}${
    mailto ? `?${new URLSearchParams({ mailto })}` : ""
  }`;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const work = await resp.json();
  const pdfUrl = work?.best_oa_location?.pdf_url;
  return typeof pdfUrl === "string" && pdfUrl.startsWith("https://") ? pdfUrl : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Nur POST erlaubt" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Fehlende Authorization" }, 401);
  }

  let payload: { result?: ImportPayload };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Ungültiger Request-Body" }, 400);
  }

  const result = payload.result;
  if (!result?.title) return jsonResponse({ error: "result.title fehlt" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: inserted, error: insertError } = await supabase
    .from("sources")
    .insert({
      type: result.type || "grau",
      title: result.title,
      authors: result.authors && result.authors.length > 0 ? result.authors : null,
      year: result.year ?? null,
      venue: result.venue ?? null,
      doi: result.doi ?? null,
      abstract: result.abstract ?? null,
      citation_count: result.citation_count ?? null,
      status: "triage",
    })
    .select("id")
    .single();

  if (insertError) {
    return jsonResponse({ error: `Anlegen fehlgeschlagen: ${insertError.message}` }, 500);
  }
  const sourceId = inserted.id as string;

  let hasPdf = false;
  let pdfError: string | null = null;
  const trustedPdfUrl = await fetchTrustedOaPdfUrl(result.openalex_id);
  if (trustedPdfUrl) {
    try {
      // Manche Verlage (z.B. MDPI) blocken Anfragen ohne plausiblen
      // Browser-User-Agent mit 403 - hoeflicher, aber browserartiger
      // User-Agent statt der Deno-Default-Kennung.
      const pdfResp = await fetch(trustedPdfUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; LitTool/0.1; +academic research tool)" },
      });
      if (!pdfResp.ok) {
        pdfError = `Open-Access-PDF nicht abrufbar (${pdfResp.status})`;
      } else {
        const bytes = new Uint8Array(await pdfResp.arrayBuffer());
        const storagePath = `${sourceId}/openalex.pdf`;
        const { error: uploadError } = await supabase.storage
          .from("pdfs")
          .upload(storagePath, bytes, { contentType: "application/pdf" });
        if (uploadError) {
          pdfError = `PDF-Upload fehlgeschlagen: ${uploadError.message}`;
        } else {
          const { error: updateError } = await supabase
            .from("sources")
            .update({ storage_path: storagePath })
            .eq("id", sourceId);
          if (updateError) {
            pdfError = `storage_path konnte nicht gesetzt werden: ${updateError.message}`;
          } else {
            hasPdf = true;
          }
        }
      }
    } catch (exc) {
      pdfError = `Open-Access-PDF-Download fehlgeschlagen: ${(exc as Error).message}`;
    }
  }

  return jsonResponse({ sourceId, hasPdf, pdfError }, 200);
});
