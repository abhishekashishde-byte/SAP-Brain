import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normalize(text = '') {
  return text.trim().replace(/\s+/g, ' ');
}

function simplify(text = '') {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function singularize(word = '') {
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function cleanSearchPhrase(question = '') {
  let q = simplify(question);

  q = q
    .replace(/\bwhat is\b/g, '')
    .replace(/\btable for\b/g, '')
    .replace(/\btcode for\b/g, '')
    .replace(/\btransaction for\b/g, '')
    .replace(/\bfiori app for\b/g, '')
    .replace(/\bfiori for\b/g, '')
    .replace(/\bapp for\b/g, '')
    .replace(/\bfield\b/g, '')
    .replace(/\btable\b/g, '')
    .replace(/\btcode\b/g, '')
    .replace(/\btransaction\b/g, '')
    .replace(/\bfiori\b/g, '')
    .replace(/\bapp\b/g, '')
    .replace(/\bthe\b/g, '')
    .replace(/\ban\b/g, '')
    .replace(/\ba\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return singularize(q);
}

function extractFieldLookup(question) {
  const q = normalize(question);

  const patterns = [
    /\bwhat is\s+([A-Z0-9_]+)\s+in\s+([A-Z0-9_]+)\b/i,
    /\b([A-Z0-9_]+)\s+field\s+in\s+([A-Z0-9_]+)\b/i,
    /\bfield\s+([A-Z0-9_]+)\s+in\s+([A-Z0-9_]+)\b/i,
  ];

  for (const pattern of patterns) {
    const match = q.match(pattern);
    if (match) {
      return {
        field: match[1].toUpperCase(),
        table: match[2].toUpperCase(),
      };
    }
  }

  return null;
}

function isLikelyObjectLookup(question) {
  const q = simplify(question);
  return (
    q.includes('table') ||
    q.includes('tcode') ||
    q.includes('transaction') ||
    q.includes('fiori') ||
    q.includes('app')
  );
}

function isLikelyTechName(question) {
  return /^[A-Z0-9_]{3,12}$/i.test(question.trim());
}

async function getRelated(objectType, techName) {
  const { data } = await supabase
    .from('sap_relationships')
    .select('*')
    .eq('from_object_type', objectType)
    .eq('from_tech_name', techName);

  return data || [];
}

async function searchField(table, field) {
  const { data, error } = await supabase
    .from('sap_fields')
    .select('*')
    .eq('table_name', table)
    .eq('field_name', field)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function searchAliasExact(searchText) {
  const { data, error } = await supabase
    .from('sap_aliases')
    .select('*')
    .ilike('alias_text', searchText)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function searchAliasLoose(searchText) {
  const { data, error } = await supabase
    .from('sap_aliases')
    .select('*')
    .or(`alias_text.ilike.%${searchText}%,alias_text.ilike.%${singularize(searchText)}%`)
    .limit(5);

  if (error) throw error;
  return data || [];
}

async function searchObjectByTechName(tech) {
  const { data, error } = await supabase
    .from('sap_objects')
    .select('*')
    .eq('tech_name', tech)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function searchObjectByKeywords(searchText) {
  const { data, error } = await supabase
    .from('sap_objects')
    .select('*')
    .or(`title.ilike.%${searchText}%,short_desc.ilike.%${searchText}%,tech_name.ilike.%${searchText}%`)
    .limit(5);

  if (error) throw error;
  return data || [];
}

function buildResponse(intent, query, match, related = [], confidence = 0, source = 'unknown') {
  return {
    intent,
    query,
    confidence,
    source,
    match,
    related,
    should_answer_directly: confidence >= 0.85,
    should_enrich_with_gemini: confidence >= 0.55 && confidence < 0.85,
  };
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

    // 1) FIELD LOOKUP
    const fieldLookup = extractFieldLookup(q);
    if (fieldLookup) {
      const fieldData = await searchField(fieldLookup.table, fieldLookup.field);

      if (fieldData) {
        const related = await getRelated('TABLE', fieldLookup.table);

        return res.status(200).json(
          buildResponse('FIELD_LOOKUP', q, fieldData, related, 0.98, 'field_exact')
        );
      }
    }

    // 2) DIRECT TECH NAME
    if (isLikelyTechName(q)) {
      const tech = q.toUpperCase();
      const objectData = await searchObjectByTechName(tech);

      if (objectData) {
        const related = await getRelated(objectData.object_type, objectData.tech_name);

        return res.status(200).json(
          buildResponse('TECH_NAME_LOOKUP', q, objectData, related, 0.97, 'tech_exact')
        );
      }
    }

    // 3) OBJECT / ALIAS LOOKUP
    if (isLikelyObjectLookup(q) || q.split(' ').length <= 5) {
      const cleaned = cleanSearchPhrase(q);

      // 3A) Exact alias
      const exactAlias = await searchAliasExact(cleaned);
      if (exactAlias) {
        const objectData = await searchObjectByTechName(exactAlias.mapped_tech_name);
        const related = await getRelated(exactAlias.mapped_object_type, exactAlias.mapped_tech_name);

        return res.status(200).json(
          buildResponse('OBJECT_LOOKUP', q, objectData || exactAlias, related, 0.93, 'alias_exact')
        );
      }

      // 3B) Loose alias
      const looseAliases = await searchAliasLoose(cleaned);
      if (looseAliases.length) {
        const best = looseAliases[0];
        const objectData = await searchObjectByTechName(best.mapped_tech_name);
        const related = await getRelated(best.mapped_object_type, best.mapped_tech_name);

        return res.status(200).json(
          buildResponse('OBJECT_LOOKUP', q, objectData || best, related, 0.72, 'alias_loose')
        );
      }

      // 3C) Object keyword/title search
      const objectMatches = await searchObjectByKeywords(cleaned);
      if (objectMatches.length) {
        const best = objectMatches[0];
        const related = await getRelated(best.object_type, best.tech_name);

        return res.status(200).json(
          buildResponse('OBJECT_LOOKUP', q, best, related, 0.58, 'object_keyword')
        );
      }
    }

    return res.status(200).json(
      buildResponse('NO_MATCH', q, null, [], 0, 'none')
    );

  } catch (error) {
    console.error('reference-search error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
