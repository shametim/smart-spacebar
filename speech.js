import { serve } from "bun";
import { join } from "path";

// Add API key from environment
const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY environment variable is required");
}

// Request counter for logging
let request_count = 0;

// Add these constants at the top after imports
const MAX_CHUNK_SIZE = 25 * 1024 * 1024; // 25MB - Groq's current limit
const MAX_DURATION = 30; // 30 seconds max recording

const server = serve({
    port: 3000,
    async fetch(req) {
        const url = new URL(req.url);
        
        // Serve static files
        if (url.pathname === "/" || url.pathname === "/index.html") {
            console.log(`[${new Date().toISOString()}] Serving index.html`);
            return new Response(Bun.file(join(import.meta.dir, "public/index.html")), {
                headers: { "Content-Type": "text/html" }
            });
        }
        
        if (url.pathname === "/script.js") {
            console.log(`[${new Date().toISOString()}] Serving script.js`);
            return new Response(Bun.file(join(import.meta.dir, "public/script.js")), {
                headers: { "Content-Type": "application/javascript" }
            });
        }

        // Handle transcription requests
        if (url.pathname === "/transcribe" && req.method === "POST") {
            request_count++;
            const request_id = `req_${request_count}`;
            
            try {
                const start_time = Date.now();
                const data = await req.arrayBuffer();
                
                if (data.byteLength > MAX_CHUNK_SIZE) {
                    console.error(`[${new Date().toISOString()}] [${request_id}] File too large: ${data.byteLength} bytes`);
                    return Response.json({ 
                        error: "Audio file too large. Please keep recordings under 30 seconds." 
                    }, { status: 413 });
                }

                // Create form data for the API request
                const form_data = new FormData();
                form_data.append('file', new Blob([data], { type: 'audio/webm' }), 'audio.webm');
                form_data.append('model', 'whisper-large-v3');
                form_data.append('response_format', 'json');
                form_data.append('language', 'en');
                form_data.append('prompt', 'coding');
                
                console.log(`[${new Date().toISOString()}] [${request_id}] Processing ${(data.byteLength / 1024).toFixed(2)}KB of audio`);
                
                const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${GROQ_API_KEY}`,
                    },
                    body: form_data
                });

                if (!response.ok) {
                    throw new Error(`Groq API error: ${response.status} ${response.statusText}`);
                }

                const transcription = await response.json();
                
                const duration = (Date.now() - start_time) / 1000;
                console.log(`[${new Date().toISOString()}] [${request_id}] Transcription completed in ${duration.toFixed(2)}s`);
                
                return Response.json({ text: transcription.text });
            } catch (err) {
                console.error(`[${new Date().toISOString()}] [${request_id}] Transcription error:`, err);
                return Response.json({ error: err.message }, { status: 500 });
            }
        }

        return new Response("Not found", { status: 404 });
    }
});

console.log(`[${new Date().toISOString()}] Server running at http://localhost:${server.port}`);
