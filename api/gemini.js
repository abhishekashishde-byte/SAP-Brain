export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { prompt, useSearch = false, imageBase64 = null, imageType = null, documentText = null } = req.body
    if (!prompt && !imageBase64) return res.status(400).json({ error: 'Prompt or image required' })

    // Discover available models
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`
    const listRes = await fetch(listUrl)
    const listData = await listRes.json()
    if (!listRes.ok) return res.status(400).json({ error: `Key error: ${JSON.stringify(listData)}` })

    const allModels = listData.models || []
    const model = allModels.find(m => m.supportedGenerationMethods?.includes('generateContent'))
    if (!model) return res.status(404).json({ error: 'No Gemini models available.' })

    const modelPath = model.name
    const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${process.env.GEMINI_API_KEY}`

    // Build parts
    const parts = []
    if (imageBase64 && imageType) {
      parts.push({ inline_data: { mime_type: imageType, data: imageBase64 } })
    }
    if (documentText) {
      parts.push({ text: `Document content:\n${documentText.slice(0, 8000)}\n\n` })
    }
    if (prompt) parts.push({ text: prompt })

    // Detect image generation/editing request
    const isImageEdit = imageBase64 && /\b(change|edit|make|convert|add|remove|replace|background|light|dark|color|style|improve|redesign)\b/i.test(prompt)

    const body = {
      contents: [{ parts }],
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.7,
        ...(isImageEdit ? { responseModalities: ['TEXT', 'IMAGE'] } : {}),
      },
    }

    if (useSearch && !imageBase64) {
      body.tools = [{ google_search: {} }]
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    // Read as text first to avoid JSON parse failures on large responses
    const rawText = await response.text()

    if (!response.ok) {
      // Try without search if that caused error
      if (useSearch) {
        delete body.tools
        const retry = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const retryText = await retry.text()
        if (retry.ok) {
          return res.status(200).json(parseResponse(retryText))
        }
      }
      return res.status(response.status).json({ error: rawText.slice(0, 500) })
    }

    return res.status(200).json(parseResponse(rawText))

  } catch (err) {
    return res.status(500).json({ error: `Server error: ${err.message}` })
  }
}

function parseResponse(rawText) {
  try {
    const data = JSON.parse(rawText)
    const parts = data.candidates?.[0]?.content?.parts || []
    const result = { content: '', images: [] }

    for (const part of parts) {
      if (part.text) result.content += part.text
      if (part.inline_data) {
        result.images.push({
          mimeType: part.inline_data.mime_type,
          data: part.inline_data.data,
        })
      }
    }

    if (!result.content && result.images.length === 0) {
      result.content = 'No response from Gemini.'
    }

    return result
  } catch (e) {
    return { content: `Parse error: ${e.message}. Raw: ${rawText.slice(0, 200)}`, images: [] }
  }
}
