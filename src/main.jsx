import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { installAuthenticatedFetch } from './apiFetchAuth.js'
import { installCreditFab } from './creditFab.js'
import { installQuotaVisualGuard } from './quotaVisualGuard.js'
import { installDocumentUploadGuard } from './documentUploadGuard.js'

installAuthenticatedFetch()
installDocumentUploadGuard()

ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)

installCreditFab()
installQuotaVisualGuard()
