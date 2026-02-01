import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, method = 'POST', payload, filePath, formDataFields } = await req.json();

    console.log(`Sending ${method} request to: ${url}`);
    
    // If filePath is provided, send as multipart/form-data with file
    if (filePath && method === 'POST') {
      console.log('Fetching file from storage:', filePath);
      
      // Create Supabase client to access storage
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      // Download file from storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('devis')
        .download(filePath);
      
      if (downloadError || !fileData) {
        console.error('Download error:', downloadError);
        throw new Error(`Failed to download file: ${downloadError?.message || 'File not found'}`);
      }
      
      console.log('File downloaded, size:', fileData.size, 'bytes');
      
      // Create FormData with the file
      const formData = new FormData();
      
      // IMPORTANT: Field name MUST be "file" (required by n8n)
      formData.append('file', fileData, 'devis.pdf');
      
      // Add metadata fields if provided in formDataFields
      if (formDataFields) {
        if (formDataFields.job_type) {
          formData.append('job_type', String(formDataFields.job_type));
          console.log('Added job_type:', formDataFields.job_type);
        }
        if (formDataFields.zip) {
          formData.append('zip', String(formDataFields.zip));
          console.log('Added zip:', formDataFields.zip);
        }
        if (formDataFields.surface !== undefined && formDataFields.surface !== null) {
          formData.append('surface', String(formDataFields.surface));
          console.log('Added surface:', formDataFields.surface);
        }
        if (formDataFields.ocr_text) {
          formData.append('ocr_text', String(formDataFields.ocr_text));
          console.log('Added ocr_text: (length:', formDataFields.ocr_text.length, 'chars)');
        }
      }
      
      console.log('FormData: file = devis.pdf + metadata fields');
      console.log('Sending multipart/form-data with file...');
      
      // Send the request (don't set Content-Type manually, fetch will do it with boundary)
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      const responseText = await response.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = responseText;
      }

      console.log('Response status:', response.status);
      console.log('Response:', responseData);

      return new Response(JSON.stringify({
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        data: responseData,
        fileSize: fileData.size,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // No filePath provided.
    // IMPORTANT: our n8n price engine requires a `file` field (multipart).
    // To support simple estimations (landing calculator), we attach a tiny dummy PDF
    // and pass parameters as regular form fields.

    const shouldSendMultipartDummy = method === 'POST' && (formDataFields || payload);

    let response: Response;

    if (shouldSendMultipartDummy) {
      const formData = new FormData();

      // Generate a tiny but valid PDF (with proper xref offsets)
      const buildMinimalPdfBytes = (): Uint8Array => {
        const enc = new TextEncoder();

        const parts: string[] = [];
        const offsets: number[] = [0]; // object 0 is the free object
        let bytesLen = 0;

        const push = (s: string) => {
          parts.push(s);
          bytesLen += enc.encode(s).byteLength;
        };

        push('%PDF-1.4\n');

        const pushObj = (objNum: number, body: string) => {
          offsets[objNum] = bytesLen;
          push(`${objNum} 0 obj\n${body}\nendobj\n`);
        };

        // 1: catalog
        pushObj(1, '<< /Type /Catalog /Pages 2 0 R >>');
        // 2: pages
        pushObj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
        // 3: page
        pushObj(
          3,
          '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> >>',
        );
        // 4: content stream
        const stream = 'BT\n/F1 12 Tf\n72 120 Td\n(Estimation) Tj\nET\n';
        pushObj(4, `<< /Length ${enc.encode(stream).byteLength} >>\nstream\n${stream}endstream`);
        // 5: font
        pushObj(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

        // xref
        const xrefOffset = bytesLen;
        push('xref\n');
        push('0 6\n');
        push('0000000000 65535 f \n');
        for (let i = 1; i <= 5; i++) {
          const off = (offsets[i] ?? 0).toString().padStart(10, '0');
          push(`${off} 00000 n \n`);
        }
        push('trailer\n');
        push('<< /Size 6 /Root 1 0 R >>\n');
        push('startxref\n');
        push(`${xrefOffset}\n`);
        push('%%EOF\n');

        const raw = enc.encode(parts.join(''));
        // Force a concrete Uint8Array<ArrayBuffer> to satisfy BlobPart typing
        return new Uint8Array(raw);
      };

      const pdfBytes = buildMinimalPdfBytes();
      // Ensure we pass a concrete ArrayBuffer (avoids TS BlobPart incompatibility with ArrayBufferLike)
      const pdfArrayBuffer = new ArrayBuffer(pdfBytes.byteLength);
      new Uint8Array(pdfArrayBuffer).set(pdfBytes);
      const dummyFile = new File([pdfArrayBuffer], 'devis.pdf', { type: 'application/pdf' });
      formData.append('file', dummyFile);
      console.log('No filePath provided: sending multipart/form-data with dummy PDF');

      const fields = (formDataFields && typeof formDataFields === 'object') ? formDataFields : payload;
      if (fields && typeof fields === 'object') {
        for (const [k, v] of Object.entries(fields)) {
          if (v === null || v === undefined) continue;
          formData.append(k, String(v));
        }
      }

      response = await fetch(url, {
        method: 'POST',
        body: formData,
      });
    } else {
      // Fallback: regular fetch with no body (GET/HEAD)
      response = await fetch(url, { method });
    }

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }

    console.log('Response status:', response.status);
    console.log('Response:', responseData);

    return new Response(JSON.stringify({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      data: responseData,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
