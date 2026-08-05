import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { installAuthenticatedFetch } from './apiFetchAuth.js'
import { installCreditFab } from './creditFab.js'

installAuthenticatedFetch()

ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)

installCreditFab()
