import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css';
import './index.css';

// Helper component to render individual result cards
const ResultCard = ({ icon, title, content, errors }) => (
    <div className="result-card">
        <div className="result-header">
            <span className="result-icon">{icon}</span>
            <span className="result-title">{title}</span>
        </div>
        <div className="result-content">
            <p dangerouslySetInnerHTML={{ __html: content }}></p>
            {errors && errors.length > 0 && (
                <div className="error-list">
                    {errors.map((error, index) => (
                        <div key={index} className="error-item">
                            <span className="timestamp">{error.time || 'N/A'}:</span> {error.issue}
                        </div>
                    ))}
                </div>
            )}
        </div>
    </div>
);

// --- Chart Generation Logic with Fixed Legend ---
const createPitchChart = (chartContainer, data) => {
    if (!data || !data.cents_ref || data.cents_ref.length === 0) {
        chartContainer.innerHTML = '<p style="color: #999; text-align: center;">Pitch visualization data not available.</p>';
        return;
    }

    const { times, cents_ref, cents_user, error_indices } = data;

    const width = 1000;
    const height = 400;
    const margin = { top: 40, right: 40, bottom: 40, left: 40 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const maxPitch = Math.max(...cents_ref, ...cents_user);
    const minPitch = Math.min(...cents_ref, ...cents_user);
    const maxTime = times[times.length - 1] || 1;
    const pitchRange = maxPitch - minPitch;

    const getPoint = (pitch, i) => {
        const effectivePitchRange = pitchRange === 0 ? 1 : pitchRange;
        const x = margin.left + (times[i] / maxTime) * chartWidth;
        const y = margin.top + ((maxPitch - pitch) / effectivePitchRange) * chartHeight;
        return `${x},${y}`;
    };

    const refPoints = cents_ref.map((pitch, i) => getPoint(pitch, i)).join(' ');
    const userPoints = cents_user.map((pitch, i) => getPoint(pitch, i)).join(' ');

    const errorMarkers = error_indices.map(i => {
        const x = margin.left + (times[i] / maxTime) * chartWidth;
        const y = margin.top + ((maxPitch - cents_user[i]) / (pitchRange === 0 ? 1 : pitchRange)) * chartHeight;
        return `<circle cx="${x}" cy="${y}" r="4" fill="#ff4444" opacity="0.9" />`;
    }).join('');

    const svg = `
        <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="background: white;">
            <defs>
                <linearGradient id="refGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style="stop-color:#ea4335;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#fbbc04;stop-opacity:1" />
                </linearGradient>
                <linearGradient id="userGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style="stop-color:#4285f4;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#34a853;stop-opacity:1" />
                </linearGradient>
            </defs>
            <g stroke="#e0e0e0" stroke-width="1">
                <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" />
                ${Array.from({length: 5}, (_, i) => `<line x1="${margin.left}" y1="${margin.top + i * chartHeight/4}" x2="${width - margin.right}" y2="${margin.top + i * chartHeight/4}" stroke="#f0f0f0"/>`).join('')}
            </g>
            <polyline fill="none" stroke="url(#refGradient)" stroke-width="3" points="${refPoints}" />
            <polyline fill="none" stroke="url(#userGradient)" stroke-width="3" points="${userPoints}" />
            ${errorMarkers}
            <text x="${width/2}" y="20" text-anchor="middle" font-family="Arial" font-size="16" font-weight="bold">Aligned Pitch Contours (in Cents)</text>
            <text x="${width/2}" y="${height - 10}" text-anchor="middle" font-family="Arial" font-size="12" fill="#666">Time (seconds)</text>
            
            <g transform="translate(${width - margin.right - 140}, ${margin.top - 20})">
                <line x1="0" y1="0" x2="30" y2="0" stroke="url(#userGradient)" stroke-width="3" />
                <text x="40" y="4" font-family="Arial" font-size="12" fill="#000">Your Singing</text>

                <line x1="0" y1="20" x2="30" y2="20" stroke="url(#refGradient)" stroke-width="3" />
                <text x="40" y="24" font-family="Arial" font-size="12" fill="#000">Reference</text>

                <circle cx="15" cy="40" r="4" fill="#ff4444" />
                <text x="40" y="44" font-family="Arial" font-size="12" fill="#000">Pitch Errors</text>
            </g>
        </svg>
    `;
    
    chartContainer.innerHTML = svg;
};


// --- Core Logic: The App Component ---
function App() {
    const [refFile, setRefFile] = useState(null);
    const [userFile, setUserFile] = useState(null);
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [progress, setProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState('Starting analysis...');
    const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);

    const refPlayerRef = useRef(null);
    const userPlayerRef = useRef(null);
    const chartContainerRef = useRef(null);
    
    const handleFileChange = (event, type) => {
        const file = event.target.files[0];
        if (!file) return;

        if (type === 'reference') {
            setRefFile(file);
        } else {
            setUserFile(file);
        }
    };
    
    // --- EFFECT TO SAFELY UPDATE AUDIO SRC ---
    useEffect(() => {
        if (refFile && refPlayerRef.current) {
            refPlayerRef.current.src = URL.createObjectURL(refFile);
        }
    }, [refFile]);

    useEffect(() => {
        if (userFile && userPlayerRef.current) {
            userPlayerRef.current.src = URL.createObjectURL(userFile);
        }
    }, [userFile]);

    // --- ROBUST AUDIO PLAYBACK LOGIC ---
    const previewAudio = async () => {
        if (isPreviewPlaying) return;

        const refPlayer = refPlayerRef.current;
        const userPlayer = userPlayerRef.current;

        if (refPlayer && userPlayer) {
            setIsPreviewPlaying(true);
            setError(null);

            try {
                userPlayer.pause();
                userPlayer.currentTime = 0;
                refPlayer.pause();
                refPlayer.currentTime = 0;

                await refPlayer.play();

                await new Promise(resolve => { refPlayer.onended = resolve; });

                await new Promise(resolve => setTimeout(resolve, 500));
                await userPlayer.play();
                
                await new Promise(resolve => { userPlayer.onended = resolve; });

            } catch (err) {
                console.error("Error during audio playback:", err);
                if (err.name !== 'AbortError') {
                    setError("Could not play audio. Please try a different file or browser.");
                }
            } finally {
                setIsPreviewPlaying(false);
            }
        }
    };
    
    const updateProgress = (percentage, message) => {
        setProgress(percentage);
        setProgressMessage(message);
    };

    const handleAnalyze = async () => {
        if (!refFile || !userFile) {
            setError('Please select both audio files.');
            return;
        }

        setLoading(true);
        setResults(null);
        setError(null);
        updateProgress(0, 'Starting analysis...');
        
        const formData = new FormData();
        formData.append('reference', refFile); 
        formData.append('user', userFile);     

        try {
            updateProgress(10, 'Uploading files...');
            const response = await axios.post('http://127.0.0.1:5000/api/analyze', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            updateProgress(30, 'Processing audio...');
            await new Promise(resolve => setTimeout(resolve, 300));
            updateProgress(60, 'Analyzing pitch accuracy...');
            await new Promise(resolve => setTimeout(resolve, 300));
            updateProgress(80, 'Checking pronunciation...');
            await new Promise(resolve => setTimeout(resolve, 300));
            setResults(response.data);
            updateProgress(100, 'Analysis complete!');
        } catch (err) {
            console.error('Analysis failed:', err);
            setError(err.response?.data?.error || 'Analysis failed. Check your Python server.');
        } finally {
            setTimeout(() => { setLoading(false); }, 500);
        }
    };

    const transformResults = (data) => {
        if (!data || !data.feedback) return [];
        const pitchErrors = data.feedback.filter(f => f.error_type === 'Pitch').map(f => ({
            time: f.time.toFixed(2) + 's',
            issue: `Your note was ${f.user_note} (Ref: ${f.ref_note})`,
        }));
        const pronunciationErrors = data.feedback.filter(f => f.error_type === 'Pronunciation').map(f => ({
            time: f.time.toFixed(2) + 's',
            issue: `Pronunciation deviation detected`,
        }));
        return [
            { icon: '🎵', title: 'Pitch Accuracy', content: `Overall Summary: ${data.summary}`, errors: pitchErrors.slice(0, 5) },
            { icon: '🗣️', title: 'Pronunciation', content: `Overall Summary: ${data.summary}`, errors: pronunciationErrors.slice(0, 5) },
            { icon: '⏱️', title: 'Timing & Rhythm', content: 'Timing is calculated via DTW alignment, errors are integrated into Pitch/Pronunciation timestamps.', errors: [{time: 'General', issue: 'Timing errors result in pitch/pronunciation mismatches.'}] },
            { icon: '💡', title: 'Suggestions', content: 'Work on pitch stability, focus on clear vowels and consistent rhythm.', errors: [{time: 'General', issue: 'Practice slow, sustained notes.'}] },
        ];
    };
    
    useEffect(() => {
        if (results && chartContainerRef.current && results.visualization) {
            createPitchChart(chartContainerRef.current, results.visualization);
        }
    }, [results]);

    const transformedResults = transformResults(results);
    const isReady = refFile && userFile;
    const analyzeBtnContent = loading ? <>{progressMessage}</> : '🔍 Analyze Singing';

    return (
        <div className="container">
            <div className="header">
                <h1>🎤 Singing Accuracy Analyzer</h1>
                <p>Compare your singing with reference audio and get detailed feedback</p>
            </div>
            <div className="features-grid">
                <div className="feature-card"><div className="feature-icon">🎧</div><div className="feature-title">Audio Analysis</div><div className="feature-desc">Advanced pitch, timing, and pronunciation analysis</div></div>
                <div className="feature-card"><div className="feature-icon">⏱️</div><div className="feature-title">Timestamped Feedback</div><div className="feature-desc">Pinpoint exact moments that need improvement</div></div>
                <div className="feature-card"><div className="feature-icon">💡</div><div className="feature-title">Smart Suggestions</div><div className="feature-desc">Get personalized recommendations for better singing</div></div>
                <div className="feature-card"><div className="feature-icon">📊</div><div className="feature-title">Visual Analysis</div><div className="feature-desc">Interactive charts and graphs of your performance</div></div>
            </div>
            <div className="main-card">
                <div className="card-header">
                    <h2>Upload Your Audio Files</h2>
                    <p>Upload both reference and user audio files to begin analysis</p>
                </div>
                <div className="card-body">
                    <div className="upload-section">
                        <div className="upload-box" id="refUploadBox">
                            <div className="upload-icon">🎵</div>
                            <div className="upload-text">Reference Audio</div>
                            <p style={{color: '#999', marginBottom: '15px'}}>Upload the original/reference singing</p>
                            <label htmlFor="refFileInput" className="upload-btn" style={{display: 'inline-block'}}>Choose File</label>
                            <input type="file" id="refFileInput" className="file-input" accept="audio/*" onChange={(e) => handleFileChange(e, 'reference')} />
                            {refFile && (
                                <>
                                    <div className="file-info" style={{display: 'block'}}>
                                        <strong>📁 {refFile.name}</strong><br />
                                        <span style={{color: '#666'}}>Size: {(refFile.size / 1024 / 1024).toFixed(2)} MB</span>
                                    </div>
                                    <audio className="audio-player" ref={refPlayerRef} controls></audio>
                                </>
                            )}
                        </div>
                        <div className="upload-box" id="userUploadBox">
                            <div className="upload-icon">🎤</div>
                            <div className="upload-text">User Audio</div>
                            <p style={{color: '#999', marginBottom: '15px'}}>Upload your singing recording</p>
                            <label htmlFor="userFileInput" className="upload-btn" style={{display: 'inline-block'}}>Choose File</label>
                            <input type="file" id="userFileInput" className="file-input" accept="audio/*" onChange={(e) => handleFileChange(e, 'user')} />
                            {userFile && (
                                <>
                                    <div className="file-info" style={{display: 'block'}}>
                                        <strong>📁 {userFile.name}</strong><br />
                                        <span style={{color: '#666'}}>Size: {(userFile.size / 1024 / 1024).toFixed(2)} MB</span>
                                    </div>
                                    <audio className="audio-player" ref={userPlayerRef} controls></audio>
                                </>
                            )}
                        </div>
                    </div>
                    <div className="controls-section">
                        <button className="control-btn" id="previewBtn" disabled={!isReady || loading || isPreviewPlaying} onClick={previewAudio}>
                            {isPreviewPlaying ? '▶️ Playing...' : '🎧 Preview Audio'}
                        </button>
                        <button className="control-btn analysis-btn" id="analyzeBtn" disabled={!isReady || loading || isPreviewPlaying} onClick={handleAnalyze}>
                            {analyzeBtnContent}
                        </button>
                    </div>
                    {loading && (
                        <div className="progress-section" style={{ display: 'block' }}>
                            <div className="progress-bar">
                                <div className="progress-fill" style={{width: `${progress}%`}}></div>
                            </div>
                            <div className="progress-text">
                                <span className="loading-spinner"></span>
                                {progressMessage}
                            </div>
                        </div>
                    )}
                    {error && <p className="error-message" style={{color: 'red', textAlign: 'center', fontWeight: 'bold'}}>{error}</p>}
                    {results && (
                        <div className="results-section" style={{display: 'block'}}>
                            <h3 style={{ marginBottom: '20px', color: '#333' }}>📊 Analysis Results</h3>
                            <div className="results-grid">
                                {transformedResults.map((result, index) => (
                                    <ResultCard key={index} {...result} />
                                ))}
                            </div>
                            <div className="visualization-section">
                                <h4 style={{ marginBottom: '15px', color: '#333'}}>📈 Pitch Analysis Visualization</h4>
                                <div className="chart-container" ref={chartContainerRef}>
                                    <p style={{color: '#999'}}>Generating Chart...</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default App;