import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx' // Import your main component
import './index.css'
import './App.css'
 // Import global styles (optional, but good practice)

// Find the root element and render the App component inside it.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)