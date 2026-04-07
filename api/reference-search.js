import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normalize(text = '') {
  return text.trim();
}

function extractFieldLookup(question) {
  const match = question.match(/\bwhat is\s+([A-Z0-9_]+)\s+in\s+([A-Z0-9_]+)\b/i);
  if (match) {
    return {
      field: match[1].toUpperCase(),
      table: match[2].toUpperCase(),
    };
  }
  return null;
}

function isLikelyObjectLookup(question) {
  const q = question.toLowerCase();
  return (
    q.includes('table') ||
    q.includes('tcode') ||
    q.includes('transaction') ||
    q.includes('fiori') ||
    q.includes('app')
  );
}

function isLikelyTechName(question) {
  return /^[A-Z0-9_]{3,10}$/i.test(question.trim());
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { question } = req.body;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Question is required' });
    }

    const q = normalize(question);

    // 1. FIELD LOOKUP
    const fieldLookup = extractFieldLookup(q);
    if (fieldLookup) {
      const { data: fieldData, error: fieldError } = await supabase
        .from('sap_fields')
        .select('*')
        .eq('table_name', fieldLookup.table)
        .eq('field_name', fieldLookup.field)
        .maybeSingle();

      if (fieldError) throw fieldError;

      if (fieldData) {
        const { data: relatedData } = await supabase
          .from('sap_relationships')
          .select('*')
          .eq('from_object_type', 'TABLE')
          .eq('from_tech_name', fieldLookup.table);

        return res.status(200).json({
          intent: 'FIELD_LOOKUP',
          query: q,
          match: fieldData,
          related: relatedData || [],
        });
      }
    }

    // 2. ALIAS / OBJECT LOOKUP
    if (isLikelyObjectLookup(q)) {
      const { data: aliasData, error: aliasError } = await supabase
        .from('sap_aliases')
        .select('*')
        .ilike('alias_text', q)
        .maybeSingle();

      if (aliasError) throw aliasError;

      if (aliasData) {
        const { data: objectData, error: objectError } = await supabase
          .from('sap_objects')
          .select('*')
          .eq('object_type', aliasData.mapped_object_type)
          .eq('tech_name', aliasData.mapped_tech_name)
          .maybeSingle();

        if (objectError) throw objectError;

        const { data: relatedData } = await supabase
          .from('sap_relationships')
          .select('*')
          .eq('from_object_type', aliasData.mapped_object_type)
          .eq('from_tech_name', aliasData.mapped_tech_name);

        return res.status(200).json({
          intent: 'OBJECT_LOOKUP',
          query: q,
          match: objectData || aliasData,
          related: relatedData || [],
        });
      }
    }

    // 3. DIRECT TECH NAME LOOKUP
    if (isLikelyTechName(q)) {
      const tech = q.toUpperCase();

      const { data: objectData, error: objectError } = await supabase
        .from('sap_objects')
        .select('*')
        .eq('tech_name', tech)
        .maybeSingle();

      if (objectError) throw objectError;

      if (objectData) {
        const { data: relatedData } = await supabase
          .from('sap_relationships')
          .select('*')
          .eq('from_object_type', objectData.object_type)
          .eq('from_tech_name', objectData.tech_name);

        return res.status(200).json({
          intent: 'TECH_NAME_LOOKUP',
          query: q,
          match: objectData,
          related: relatedData || [],
        });
      }
    }

    return res.status(200).json({
      intent: 'NO_MATCH',
      query: q,
      match: null,
      related: [],
    });

  } catch (error) {
    console.error('reference-search error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
