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
      
      // Add the file with field name "data00" (n8n expects this)
      formData.append('data00', fileData, 'devis.pdf');
      
      console.log('FormData: data00 = devis.pdf (file only, no other fields)');
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
