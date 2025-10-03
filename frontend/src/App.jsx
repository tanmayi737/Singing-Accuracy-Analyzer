import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
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

// --- New Chart Generation Logic (Using Real Data) ---
const createPitchChart = (chartContainer, data) => {
    if (!data || !data.cents_ref || data.cents_ref.length === 0) {
        chartContainer.innerHTML = '<p style="color: #999; text-align: center;">Pitch visualization data not available.</p>';
        return;
    }

    const { times, cents_ref, cents_user, error_indices } = data;
    
    // SVG and Chart dimensions
    const width = 800;
    const height = 300;
    const margin = { top: 30, right: 30, bottom: 30, left: 30 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // Calculate dynamic scales for pitch (Y-axis) and time (X-axis)
    const maxPitch = Math.max(...cents_ref, ...cents_user);
    const minPitch = Math.min(...cents_ref, ...cents_user);
    const maxTime = times[times.length - 1] || 1;
    const pitchRange = maxPitch - minPitch;
    
    // Generate SVG path points and error markers
    const getPoint = (pitch, i) => {
        const x = margin.left + (times[i] / maxTime) * chartWidth;
        const y = margin.top + ((maxPitch - pitch) / pitchRange) * chartHeight;
        return `${x},${y}`;
    };

    const refPoints = cents_ref.map((pitch, i) => getPoint(pitch, i)).join(' ');
    const userPoints = cents_user.map((pitch, i) => getPoint(pitch, i)).join(' ');
    
    const errorMarkers = error_indices.map(i => {
        const x = margin.left + (times[i] / maxTime) * chartWidth;
        const y = margin.top + ((maxPitch - cents_user[i]) / pitchRange) * chartHeight;
        return `<circle cx="${x}" cy="${y}" r="4" fill="#ff4444" opacity="0.9" />`;
    }).join('');

    // --- SVG Template (Matching the visual style) ---
    const svg = `
        <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="background: white;">
            <defs>
                <linearGradient id="refGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style="stop-color:#4285f4;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#34a853;stop-opacity:1" />
                </linearGradient>
                <linearGradient id="userGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style="stop-color:#ea4335;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#fbbc04;stop-opacity:1" />
                </linearGradient>
            </defs>
            
            <g stroke="#e0e0e0" stroke-width="1">
                <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" />
                ${/* Horizontal guides */ Array.from({length: 5}, (_, i) => `<line x1="${margin.left}" y1="${margin.top + i * chartHeight/4}" x2="${width - margin.right}" y2="${margin.top + i * chartHeight/4}" stroke="#f0f0f0"/>`).join('')}
            </g>
            
            <polyline fill="none" stroke="url(#refGradient)" stroke-width="3" points="${refPoints}" />
            
            <polyline fill="none" stroke="url(#userGradient)" stroke-width="3" points="${userPoints}" />
            
            ${errorMarkers}
            
            <text x="${width/2}" y="20" text-anchor="middle" font-family="Arial" font-size="16" font-weight="bold">Aligned Pitch Contours (in Cents)</text>
            <text x="${width/2}" y="${height - 10}" text-anchor="middle" font-family="Arial" font-size="12" fill="#666">Time (seconds)</text>
            
            <g transform="translate(600, 30)">
                <line x1="0" y1="0" x2="40" y2="0" stroke="url(#refGradient)" stroke-width="4" />
                <text x="50" y="4" font-family="Arial" font-size="12" fill="#000">Reference</text>

                <line x1="0" y1="25" x2="40" y2="25" stroke="url(#userGradient)" stroke-width="4" />
                <text x="50" y="29" font-family="Arial" font-size="12" fill="#000">Your Singing</text>

                <circle cx="20" cy="50" r="4" fill="#ff4444" />
                <text x="50" y="54" font-family="Arial" font-size="12" fill="#000">Errors</text>
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

    const refPlayerRef = useRef(null);
    const userPlayerRef = useRef(null);
    const chartContainerRef = useRef(null);
    
    // (Rest of the handleFileChange, previewAudio, handleAnalyze, and transformResults functions remain the same)
    const handleFileChange = (event, type) => {
        const file = event.target.files[0];
        if (!file) return;

        const url = URL.createObjectURL(file);
        if (type === 'reference') {
            setRefFile(file);
            if (refPlayerRef.current) refPlayerRef.current.src = url;
        } else {
            setUserFile(file);
            if (userPlayerRef.current) userPlayerRef.current.src = url;
        }
    };
    
    const previewAudio = () => {
        if (refPlayerRef.current && userPlayerRef.current) {
            refPlayerRef.current.play();
            refPlayerRef.current.onended = () => {
                setTimeout(() => { userPlayerRef.current.play(); }, 500);
            };
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
    
    // --- Hook to generate chart after results are loaded ---
    useEffect(() => {
        if (results && chartContainerRef.current && results.visualization) {
            // CALL THE CHART FUNCTION WITH REAL DATA
            createPitchChart(chartContainerRef.current, results.visualization);
        }
    }, [results]);


    const transformedResults = transformResults(results);
    const isReady = refFile && userFile;
    const analyzeBtnContent = loading 
        ? <>{progressMessage}</>
        : '🔍 Analyze Singing';

    // (The RENDER function remains the same as your final provided JSX structure)
    return (
        <div className="container">
            {/* ... JSX Header and Features Grid ... */}
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

            {/* Main Application Card */}
            <div className="main-card">
                <div className="card-header">
                    <h2>Upload Your Audio Files</h2>
                    <p>Upload both reference and user audio files to begin analysis</p>
                </div>
                
                <div className="card-body">
                    {/* Upload Section */}
                    <div className="upload-section">
                        {/* Reference Upload Box */}
                        <div className="upload-box" id="refUploadBox">
                            <div className="upload-icon">🎵</div>
                            <div className="upload-text">Reference Audio</div>
                            <p style={{color: '#999', marginBottom: '15px'}}>Upload the original/reference singing</p>
                            
                            {/* Input: Invisible but linked to button */}
                            <label htmlFor="refFileInput" className="upload-btn" style={{display: 'inline-block'}}>Choose File</label>
                            <input type="file" id="refFileInput" className="file-input" accept="audio/*" onChange={(e) => handleFileChange(e, 'reference')} />
                            
                            {/* File Info and Player */}
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

                        {/* User Upload Box */}
                        <div className="upload-box" id="userUploadBox">
                            <div className="upload-icon">🎤</div>
                            <div className="upload-text">User Audio</div>
                            <p style={{color: '#999', marginBottom: '15px'}}>Upload your singing recording</p>

                            <label htmlFor="userFileInput" className="upload-btn" style={{display: 'inline-block'}}>Choose File</label>
                            <input type="file" id="userFileInput" className="file-input" accept="audio/*" onChange={(e) => handleFileChange(e, 'user')} />
                            
                            {/* File Info and Player */}
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

                    {/* Controls Section */}
                    <div className="controls-section">
                        <button className="control-btn" id="previewBtn" disabled={!isReady || loading} onClick={previewAudio}>
                            🎧 Preview Audio
                        </button>
                        <button className="control-btn analysis-btn" id="analyzeBtn" disabled={!isReady || loading} onClick={handleAnalyze}>
                            {analyzeBtnContent}
                        </button>
                    </div>

                    {/* Progress Section (Controlled by loading state) */}
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
                    
                    {/* Results Section */}
                    {results && (
                        <div className="results-section" style={{display: 'block'}}>
                            <h3 style={{ marginBottom: '20px', color: '#333' }}>📊 Analysis Results</h3>
                            
                            <div className="results-grid">
                                {transformedResults.map((result, index) => (
                                    <ResultCard key={index} {...result} />
                                ))}
                            </div>

                            {/* Visualization Section */}
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