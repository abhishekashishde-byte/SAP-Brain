// One Vercel serverless entry point for all Discovery operations.
// The existing public API paths are preserved by vercel.json rewrites.
// Keep the implementation modules outside /api, otherwise Hobby counts
// each module as a separate serverless function.
import discoveryAI from '../server/discovery/discovery-ai.js'
import discoveryImport from '../server/discovery/discovery-import.js'
import discoveryTranscript from '../server/discovery/discovery-transcript.js'
import discoveryRetention from '../server/discovery/discovery-retention.js'
import discoveryFind from '../server/discovery/discovery-find.js'

const routes={
  ai:discoveryAI,
  import:discoveryImport,
  transcript:discoveryTranscript,
  retention:discoveryRetention,
  find:discoveryFind
}
export default async function handler(req,res){
 const route=typeof req.query?.route==='string'?req.query.route:null
 const action=routes[route]
 if(!action)return res.status(404).json({error:'Unknown Discovery API route'})
 return action(req,res)
}
