from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import tempfile
import numpy as np

# --- Core Analysis Functions (From your SeekhProjectFinal/Audio.py) ---
import librosa as lib
from librosa.sequence import dtw
import pyloudnorm
from math import log2

A4 = 440
C0 = A4 * (2 ** -4.75)
name = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

def normalize_loudness(audio, sr, target_lufs=-23.0):
    meter = pyloudnorm.Meter(sr)
    loudness = meter.integrated_loudness(audio)
    normalized = pyloudnorm.normalize.loudness(audio, loudness, target_lufs)
    return normalized

def pitch(freq):
    if freq <= 0:
        return "N/A"
    h = round(12 * log2(freq / C0))
    octave = h // 12
    n = h % 12
    return name[n] + str(octave)

def hz_to_cents(f):
    return 1200 * np.log2(f / 440.0) 
# ----------------------------------------------------------------------


app = Flask(__name__)
CORS(app) 

@app.route('/api/analyze', methods=['POST'])
def analyze_singing():
    # --- File Upload Handling ---
    if 'reference' not in request.files or 'user' not in request.files:
        return jsonify({"error": "Both reference and user audio files are required"}), 400

    ref_file = request.files['reference']
    user_file = request.files['user']

    with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp_ref:
        ref_file.save(tmp_ref.name)
        ref_path = tmp_ref.name
    with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp_user:
        user_file.save(tmp_user.name)
        user_path = tmp_user.name
        
    try:
        # --- Core Analysis Logic (Using Temporary Files) ---
        ref_audio, sr_ref = lib.load(ref_path, sr=None)
        user_audio, sr_user = lib.load(user_path, sr=None)

        if sr_ref != sr_user:
            user_audio = lib.resample(user_audio, orig_sr=sr_user, target_sr=sr_ref)
            sr_user = sr_ref

        ref_audio, _ = lib.effects.trim(ref_audio, top_db=50) 
        user_audio, _ = lib.effects.trim(user_audio, top_db=50)
        ref_audio = normalize_loudness(ref_audio, sr_ref)
        user_audio = normalize_loudness(user_audio, sr_ref)

        f0_ref = lib.yin(ref_audio, fmin=lib.note_to_hz('C2'), fmax=lib.note_to_hz('C7'), sr=sr_ref)
        f0_user = lib.yin(user_audio, fmin=lib.note_to_hz('C2'), fmax=lib.note_to_hz('C7'), sr=sr_ref)

        D, wp = dtw(f0_ref, f0_user)
        aligned_f0_ref = f0_ref[wp[:, 0]]
        aligned_f0_user = f0_user[wp[:, 1]]
        
        cents_ref = hz_to_cents(aligned_f0_ref)
        cents_user = hz_to_cents(aligned_f0_user)
        cent_errors = np.abs(cents_ref - cents_user)

        voiced_mask = (aligned_f0_ref > 0) & (aligned_f0_user > 0)
        error_indices_full = np.where(cent_errors > 50)[0] # Get indices on the full aligned array
        
        hop_length = 512
        times_ref = np.arange(len(f0_ref)) * hop_length / sr_ref
        aligned_times = times_ref[wp[:, 0]]
        
        # --- Feedback Generation (Simplified for JSON) ---
        pitch_feedback = []
        if len(error_indices_full) > 0:
            error_times = aligned_times[error_indices_full]
            ref_pitches_error = aligned_f0_ref[error_indices_full]
            user_pitches_error = aligned_f0_user[error_indices_full]
            
            for i in range(len(error_times)):
                t = error_times[i]
                ref_hz = ref_pitches_error[i]
                user_hz = user_pitches_error[i]
                pitch_feedback.append({
                    "time": round(float(t), 2),
                    "ref_note": pitch(ref_hz),
                    "user_note": pitch(user_hz),
                    "error_type": "Pitch"
                })

        mfcc_ref = lib.feature.mfcc(y=ref_audio, sr=sr_ref)
        mfcc_user = lib.feature.mfcc(y=user_audio, sr=sr_ref)
        aligned_mfcc_ref = mfcc_ref[:, wp[:, 0]]
        aligned_mfcc_user = mfcc_user[:, wp[:, 1]]
        mfcc_diff = np.mean(np.abs(aligned_mfcc_ref - aligned_mfcc_user), axis=0)
        mfcc_error_threshold = 0.5
        mfcc_error_indices = np.where(mfcc_diff > mfcc_error_threshold)[0]
        
        pronunciation_feedback = []
        mfcc_error_times = aligned_times[mfcc_error_indices]
        for t in mfcc_error_times:
            if not pronunciation_feedback or round(float(t), 1) != pronunciation_feedback[-1]['time']:
                 pronunciation_feedback.append({
                    "time": round(float(t), 2),
                    "error_type": "Pronunciation"
                })

        all_feedback = sorted(pitch_feedback + pronunciation_feedback, key=lambda x: x['time'])

        # --- CRITICAL: Visualization Data Export ---
        visualization_data = {
            # Convert NumPy arrays to standard Python lists for JSON serialization
            "times": aligned_times.astype(float).tolist(),
            "cents_ref": cents_ref.astype(float).tolist(),
            "cents_user": cents_user.astype(float).tolist(),
            # Only export the indices that correspond to pitch errors (for markers)
            "error_indices": error_indices_full.astype(int).tolist()
        }
        
        # --- Send Full Response ---
        return jsonify({
            "success": True,
            "feedback": all_feedback,
            "visualization": visualization_data,
            "summary": f"Found {len(pitch_feedback)} significant pitch errors and {len(pronunciation_feedback)} moments of pronunciation difference."
        })

    except Exception as e:
        print(f"Error during analysis: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        # Clean up temporary files
        os.remove(ref_path)
        os.remove(user_path)

if __name__ == '__main__':
    app.run(debug=True, port=5000)