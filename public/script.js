/// <reference lib="dom" />

let media_recorder;
let audio_chunks = [];
let is_recording = false;
let is_copy_mode = false;

async function init_recording() {
    try {
        // First check if getUserMedia is supported
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Your browser does not support audio recording');
        }

        // For Safari, we need to explicitly check permissions
        if (navigator.permissions && navigator.permissions.query) {
            try {
                const permission_status = await navigator.permissions.query({ name: 'microphone' });
                if (permission_status.state === 'denied') {
                    throw new Error('Microphone permission was denied. Please enable it in your browser settings.');
                }
            } catch (permission_err) {
                // Safari might not support permissions API, continue anyway
                console.log('Could not check permissions:', permission_err);
            }
        }

        // Safari-friendly audio constraints with compression
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                channelCount: 1,        // Mono audio
                sampleRate: 16000,      // Lower sample rate
            },
            video: false
        });

        // Try to use compression if supported, fallback gracefully if not
        const options = {};
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            options.mimeType = 'audio/webm;codecs=opus';
        }
        media_recorder = new MediaRecorder(stream, options);
        
        media_recorder.ondataavailable = (event) => {
            audio_chunks.push(event.data);
        };

        media_recorder.onstop = async () => {
            try {
                const audio_blob = new Blob(audio_chunks, { type: 'audio/webm' });
                
                const response = await fetch('/transcribe', {
                    method: 'POST',
                    body: audio_blob
                });
                
                const result = await response.json();
                if (result.error) {
                    document.getElementById('transcription').textContent = 'Error: ' + result.error;
                    return;
                }
                
                document.getElementById('transcription').textContent = result.text;
                
                // Attempt immediate clipboard copy
                try {
                    await navigator.clipboard.writeText(result.text);
                    // Provide haptic feedback if supported
                    if (navigator.vibrate) {
                        navigator.vibrate(50);
                    }
                    document.getElementById('status_text').textContent = 'Copied! Press and hold spacebar to record again';
                    is_recording = false;
                    is_copy_mode = false;
                } catch (copy_err) {
                    // Fallback to manual copy mode if automatic copy fails
                    console.error('Failed to auto-copy:', copy_err);
                    document.getElementById('status_text').textContent = 'Press spacebar to copy to clipboard';
                    is_recording = false;
                    is_copy_mode = true;
                    
                    // Rest of the existing copy handler code...
                }

                audio_chunks = [];
            } catch (err) {
                console.error('Error in stop handler:', err);
                document.getElementById('status_text').textContent = 'An error occurred while processing the recording';
            }
        };
    } catch (err) {
        console.error('Failed to initialize recording:', err);
        let error_message = 'Error: Could not access microphone. ';
        
        
        document.getElementById('status_text').textContent = error_message;
    }
}

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !is_recording && !is_copy_mode) {
        e.preventDefault();
        start_time = Date.now();
        audio_chunks = [];
        media_recorder.start();
        is_recording = true;
        document.getElementById('transcription').textContent = 'Recording...';
        document.getElementById('status_text').textContent = 'Release spacebar when done recording';
    }
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && is_recording) {
        e.preventDefault();
        media_recorder.stop();
        document.getElementById('status_text').textContent = 'Processing...';
    }
});

init_recording().catch(console.error);