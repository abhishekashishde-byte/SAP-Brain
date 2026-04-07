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
    .replace(/\bwhich field stores\b/g, '')
    .replace(/\bwhich field\b/g, '')
    .replace(/\bfield for\b/g, '')
    .replace(/\bwhere is\b/g, '')
    .replace(/\bstored in\b/g, '')
    .replace(/\btable for\b/g, '')
    .replace(/\btables for\b/g, '')
    .replace(/\btcode for\b/g, '')
    .replace(/\btransaction for\b/g, '')
    .replace(/\bfiori app for\b/g, '')
    .replace(/\bfiori for\b/g, '')
    .replace(/\bapp for\b/g, '')
    .replace(/\bfield\b/g, '')
    .replace(/\btable\b/g, '')
    .replace(/\btables\b/g, '')
    .replace(/\btcode\b/g, '')
    .replace(/\btransaction\b/g, '')
    .replace(/\bfiori\b/g, '')
    .replace(/\bapp\b/g, '')
    .replace(/\bdifference between\b/g, '')
    .replace(/\band\b/g, ' ')
    .replace(/\bvs\b/g, ' ')
    .replace(/\bthe\b/g, '')
    .replace(/\ban\b/g, '')
    .replace(/\ba\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return q;
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

function extractFieldMeaningLookup(question) {
  const q = simplify(question);

  const patterns = [
    /\bwhich field stores (.+?) in ([a-z0-9_]+)\b/i,
    /\bfield for (.+?) in ([a-z0-9_]+)\b/i,
    /\bwhere is (.+?) stored in ([a-z0-9_]+)\b/i,
  ];

  for (const pattern of patterns) {
    const match = q.match(pattern);
    if (match) {
      return {
        meaning: match[1].trim(),
        table: match[2].toUpperCase(),
      };
    }
  }

  return null;
}

function extractMultipleTechNames(question) {
  const matches = question.match(/\b[A-Z0-9_]{3,12}\b/g) || [];
  const filtered = [...new Set(matches.map(x => x.toUpperCase()))];
  return filtered.length >= 2 ? filtered.slice(0, 5) : [];
}

function isLikelyObjectLookup(question) {
  const q = simplify(question);
  return (
    q.includes('table') ||
    q.includes('tables') ||
    q.includes('tcode') ||
    q.includes('transaction') ||
    q.includes('fiori') ||
    q.includes('app') ||
    q.includes('difference between') ||
    q.includes(' vs ')
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

async function searchFieldsByMeaning(table, meaning) {
  const { data, error } = await supabase
    .from('sap_fields')
    .select('*')
    .eq('table_name', table)
    .or(`short_desc.ilike.%${meaning}%,common_meaning.ilike.%${meaning}%`)
    .limit(5);

  if (error) throw error;
  return data || [];
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
    .limit(8);

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

async function searchObjectsByTechNames(techNames) {
  const { data, error } = await supabase
    .from('sap_objects')
    .select('*')
    .in('tech_name', techNames);

  if (error) throw error;
  return data || [];
}

async function searchObjectByKeywords(searchText) {
  const { data, error } = await supabase
    .from('sap_objects')
    .select('*')
    .or(`title.ilike.%${searchText}%,short_desc.ilike.%${searchText}%,tech_name.ilike.%${searchText}%`)
    .limit(8);

  if (error) throw error;
  return data || [];
}

function buildResponse(intent, query, match, related = [], confidence = 0, source = 'unknown', matches = []) {
  return {
    intent,
    query,
    confidence,
    source,
    match,
    matches,
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

    // 1) EXACT FIELD LOOKUP
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

    // 2) FIELD BY MEANING LOOKUP
    const fieldMeaningLookup = extractFieldMeaningLookup(q);
    if (fieldMeaningLookup) {
      const fields = await searchFieldsByMeaning(fieldMeaningLookup.table, fieldMeaningLookup.meaning);

      if (fields.length === 1) {
        const related = await getRelated('TABLE', fieldMeaningLookup.table);

        return res.status(200).json(
          buildResponse('FIELD_MEANING_LOOKUP', q, fields[0], related, 0.92, 'field_meaning_exact')
        );
      }

      if (fields.length > 1) {
        return res.status(200).json(
          buildResponse(
            'MULTI_FIELD_LOOKUP',
            q,
            fields[0],
            [],
            0.82,
            'field_meaning_multi',
            fields
          )
        );
      }
    }

    // 3) MULTI TECH-NAME LOOKUP
    const multiTechNames = extractMultipleTechNames(q);
    if (multiTechNames.length) {
      const objects = await searchObjectsByTechNames(multiTechNames);

      if (objects.length >= 2) {
        return res.status(200).json(
          buildResponse(
            'MULTI_OBJECT_LOOKUP',
            q,
            objects[0],
            [],
            0.95,
            'multi_tech_exact',
            objects
          )
        );
      }
    }

    // 4) DIRECT TECH NAME
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

    // 5) OBJECT / ALIAS LOOKUP
    if (isLikelyObjectLookup(q) || q.split(' ').length <= 6) {
      const cleaned = cleanSearchPhrase(q);

      const exactAlias = await searchAliasExact(cleaned);
      if (exactAlias) {
        const objectData = await searchObjectByTechName(exactAlias.mapped_tech_name);
        const related = await getRelated(exactAlias.mapped_object_type, exactAlias.mapped_tech_name);

        return res.status(200).json(
          buildResponse('OBJECT_LOOKUP', q, objectData || exactAlias, related, 0.93, 'alias_exact')
        );
      }

      const looseAliases = await searchAliasLoose(cleaned);
      if (looseAliases.length) {
        const techNames = [...new Set(looseAliases.map(a => a.mapped_tech_name))];
        const objects = await searchObjectsByTechNames(techNames);

        if (objects.length >= 2) {
          return res.status(200).json(
            buildResponse(
              'MULTI_OBJECT_LOOKUP',
              q,
              objects[0],
              [],
              0.78,
              'alias_loose_multi',
              objects
            )
          );
        }

        const best = looseAliases[0];
        const objectData = await searchObjectByTechName(best.mapped_tech_name);
        const related = await getRelated(best.mapped_object_type, best.mapped_tech_name);

        return res.status(200).json(
          buildResponse('OBJECT_LOOKUP', q, objectData || best, related, 0.72, 'alias_loose')
        );
      }

      const objectMatches = await searchObjectByKeywords(cleaned);
      if (objectMatches.length >= 2) {
        return res.status(200).json(
          buildResponse(
            'MULTI_OBJECT_LOOKUP',
            q,
            objectMatches[0],
            [],
            0.68,
            'object_keyword_multi',
            objectMatches
          )
        );
      }

      if (objectMatches.length === 1) {
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
