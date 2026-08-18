from pathlib import Path

chat_path = Path('api/chat.js')
brain_path = Path('src/pages/Brain.jsx')
chat = chat_path.read_text()
brain = brain_path.read_text()


def replace_exact(text, old, new, label, count=1):
    found = text.count(old)
    if found != count:
        raise SystemExit(f'{label}: expected {count} match(es), found {found}')
    return text.replace(old, new, count)


def replace_prompt_block(text, function_name, new_block, label):
    fn = text.index(function_name)
    start = text.index('MANDATORY WANI THEME — ${theme.name.toUpperCase()}:', fn)
    end = text.index('\n\nQUESTION:', start)
    return text[:start] + new_block + text[end:]


# ---------------------------------------------------------------------------
# api/chat.js — white is now a product-level art-direction rule, not a theme.
# ---------------------------------------------------------------------------
chat = replace_exact(
    chat,
    "// theme keys; unknown values fall back to Aurora and are never interpolated into",
    "// theme keys; unknown values fall back to Light and are never interpolated into",
    'theme fallback comment',
)
chat = replace_exact(
    chat,
    "    : 'aurora'\n  return { key, ...IMAGE_THEME_PROFILES[key] }",
    "    : 'light'\n  return { key, ...IMAGE_THEME_PROFILES[key] }",
    'theme resolver fallback',
)

# Both image generators ignore dark workspace themes for the image canvas.
chat = replace_exact(
    chat,
    "  const theme = resolveImageTheme(themeKey)",
    "  const theme = resolveImageTheme('light')",
    'force generated-image light theme',
    count=2,
)

handout_block = """MANDATORY ART DIRECTION — WHITE ENTERPRISE CONSULTANT NOTE:
- background/canvas MUST be clean white (#FFFFFF) or an almost-white neutral (#FAFBFC). This is a HARD PRODUCT RULE and overrides the workspace/profile theme.
- NEVER use a full-page purple, violet, red, orange, black, charcoal, navy, gradient, cosmic, neon, or other dark/colored background.
- body text must be deep navy / charcoal on white for maximum readability.
- accents may use restrained SAP-like blue, green, yellow, and small muted purple ONLY as local highlights. Accent colors must never become the page background.
- cards/panels must remain white or very pale gray/blue with thin subtle borders.

STYLE AND INFORMATION DENSITY:
- create a professional SAP training handout / senior-consultant sketchnote / technical explainer on WHITE PAPER.
- hand-drawn arrows or small annotations are allowed sparingly, but typography must be clean and highly legible. NO chalkboard aesthetic, neon, glow, cosmic, cyberpunk, nightclub, or generic AI-poster styling.
- prioritize INFORMATION ARCHITECTURE over decoration: diagrams, object trees, process arrows, comparison panels, legends, callout boxes, purpose boxes, key-point boxes, gotchas, and technical relationships should teach the answer visually.
- NEVER turn a detailed SAP answer into a sparse poster. Preserve the useful technical substance, conditions, hierarchy, practical impact, caveats, exceptions, and distinctions.
- aim for 5-8 clearly separated information sections when the verified answer supports them.
- include roughly 75-90% of the substantive information from the VERIFIED ANSWER, shortened into visual phrases rather than deleted.
- if the answer compares multiple transactions/contexts, use side-by-side columns or panels and preserve what is different in each context.
- include purpose, practical impact, key points, important behavior/gotchas, and relationships whenever they exist in the verified answer.
- for a short answer, enrich ONLY from the VERIFIED ANSWER. Never add new SAP facts from the image model's own knowledge.
- preserve technical identifiers EXACTLY as supplied (T-codes, app IDs, SAP Notes, tables, fields, BAdIs, SPRO paths). Never invent, alter, or autocorrect them.
- if the verified answer contains uncertainty, preserve that uncertainty visibly.
- use a sensible title size; the title must not consume excessive page space.
- leave the bottom 7-8% COMPLETELY BLANK WHITE for exact Wani branding added later. Do not draw branding yourself.

HARD NEGATIVE RULES:
- no purple/red/dark full-canvas backgrounds
- no gradients or colored page background
- no sparse 3-box/3-panel summary when the answer contains materially more information
- no huge decorative headline or excessive empty space
- no decorative graphics that replace useful SAP information"""

customer_block = """MANDATORY ART DIRECTION — WHITE ENTERPRISE CUSTOMER BRIEF:
- background/canvas MUST be clean white (#FFFFFF) or an almost-white neutral (#FAFBFC). This is a HARD PRODUCT RULE and overrides the workspace/profile theme.
- NEVER use a full-page purple, violet, red, orange, black, charcoal, navy, gradient, cosmic, neon, or other dark/colored background.
- body text must be deep navy / charcoal on white for excellent readability.
- use restrained SAP-like blue as the primary accent; green, yellow, and small muted purple may distinguish concepts only where useful. Never flood the page with one accent color.
- cards/panels must remain white or very pale gray/blue with thin blue-gray borders and subtle separation.

STYLE AND INFORMATION DENSITY:
- premium SAP training infographic + management consulting handout + technical architecture diagram.
- polished, formal, client-facing; NOT handwritten, playful, futuristic, neon, glowing, chalkboard, cosmic, cyberpunk, or generic AI-poster styling.
- prioritize INFORMATION ARCHITECTURE over decoration. DESIGN THE ANSWER VISUALLY instead of putting a short summary on a background.
- use comparison columns, SAP object trees, process diagrams, arrows, legends, callout boxes, purpose boxes, key-point boxes, relationships, and concise explanatory labels whenever supported by the verified answer.
- NEVER reduce a detailed SAP answer into a sparse poster. Preserve major distinctions, transaction contexts, mechanisms, purpose, practical impact, caveats, exceptions, and technical relationships.
- aim for 5-8 clearly separated information sections when the verified answer supports them.
- include roughly 75-90% of the substantive VERIFIED ANSWER, shortened into visual phrases rather than deleted.
- when the answer compares 2-4 SAP contexts, dedicate a clear column/panel to each and retain the differences between them.
- include a compact legend and/or key-takeaways section when it ADDS information rather than merely repeating the panels.
- for detailed answers, prefer a dense but readable customer-workshop handout over a minimalist poster.
- never add facts that are not in the VERIFIED ANSWER.
- preserve SAP technical identifiers EXACTLY as supplied; never invent or autocorrect T-codes, tables, fields, app IDs, BAdIs, SAP Notes, or SPRO paths.
- if uncertainty exists in the verified answer, preserve it visibly.
- use clean professional typography with a sensible title size; the title must not consume excessive vertical space.
- leave the bottom 7-8% COMPLETELY BLANK WHITE for exact Wani branding added later. Do not draw branding yourself.

HARD NEGATIVE RULES:
- no purple/red/dark full-canvas backgrounds
- no gradient or colored page background of any kind
- no sparse 3-panel poster when the verified answer contains substantially more useful information
- no excessive whitespace created by deleting technical content
- no decorative graphics that replace useful SAP information"""

chat = replace_prompt_block(chat, 'async function generateHandoutOnDemand', handout_block, 'consultant note prompt')
chat = replace_prompt_block(chat, 'async function generateVisualOnDemand', customer_block, 'customer brief prompt')

# API defaults must also be light, even if an older client sends no theme key.
chat = replace_exact(
    chat,
    "const { question = '', answerText = '', themeKey = 'aurora' } = body",
    "const { question = '', answerText = '', themeKey = 'light' } = body",
    'on-demand action light defaults',
    count=2,
)

# Exact Wani footer branding must stay white too, independent of workspace theme.
brain = replace_exact(
    brain,
    "    const brandTheme = IMAGE_THEME_UI[themeKey] || IMAGE_THEME_UI.aurora",
    "    const brandTheme = IMAGE_THEME_UI.light",
    'force exact branding footer light',
)

chat_path.write_text(chat)
brain_path.write_text(brain)
print('Applied white enterprise visual art direction to Customer Brief + Consultant Note')
