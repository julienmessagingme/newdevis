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
    
    // Standard JSON or GET request (existing behavior)
    console.log('Payload:', JSON.stringify(payload, null, 2));

    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    // Only add body for non-GET/HEAD methods
    if (method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(payload);
    }

    const response = await fetch(url, fetchOptions);

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
