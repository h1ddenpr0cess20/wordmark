---
name: WebShell Research & Search
description: Use when the webshell MCP server is connected and the task is finding, verifying, or synthesizing information from the web — searches, news, and reading pages. Covers the web_search, news_search, and fetch_url tools (SearXNG multi-engine, with curl_cffi + Playwright fetching) and how to query, follow through, and source claims well.
---

You are doing web research through the **webshell** MCP server's stack: a
SearXNG metasearch engine (queries many engines at once) plus a fetcher that
tries `curl_cffi` first and falls back to a real browser (Playwright) for
JavaScript-heavy pages. Your tools are `web_search`, `news_search`, and
`fetch_url`. Search is for *finding* the right pages; the answer comes from
*reading* them — don't stop at the snippet.

## Query like a search engineer
- **Start specific, then broaden.** Lead with the distinctive terms (error
  string, exact product name, function signature, proper nouns). If it returns
  little, drop the least essential word and retry — don't just rephrase
  conversationally.
- **Use operators** the engines honor: `"exact phrase"` for fixed wording,
  `-term` to exclude noise, `site:docs.example.com` to pin a source,
  `filetype:pdf` for papers/specs, `intitle:` when the topic must be the page's
  subject.
- **Match the query to the source you expect.** Paste an error verbatim (in
  quotes) to land on issue trackers; name the official site for canonical docs;
  add the year for anything time-sensitive.
- **Run a few angled queries, not one.** Different phrasings surface different
  pages; a single search is a sample, not an answer.

## web_search vs news_search
- `web_search` for general, durable information — docs, references, how-tos,
  background. Use its filters to cut noise.
- `news_search` when **recency and events** matter (releases, incidents,
  "latest", "as of"). Prefer it over `web_search` for anything where last week's
  page is wrong, and weight the most recent, most authoritative results.

## Read before you conclude — fetch_url
- After a search, **`fetch_url` the actual page** rather than trusting the
  snippet, which is often stale or out of context. Request `markdown` for
  reading prose, `text` for clean extraction, `html` when you need structure
  (tables, attributes, links).
- A thin or empty result usually means the page is JS-rendered — `fetch_url`
  already falls back to Playwright, so **retry once** before concluding the
  content isn't there. If it's still empty, the page may be paywalled or
  login-gated; find an alternate source instead of guessing its contents.
- Go to the **primary source** when one exists — official docs, the spec, the
  release notes, the filing — not a blog summarizing it. Use search to *find*
  the primary source, then read that.

## Verify and synthesize
- **Corroborate anything load-bearing** across two independent sources before
  stating it as fact. A single page — especially a forum answer or AI-generated
  summary — is a lead, not a confirmation.
- **Prefer recent and authoritative.** Check the publish/update date; official
  and primary sources outrank aggregators; note when a source is dated or
  disputed rather than presenting it flatly.
- **Distinguish what you found from what you inferred.** Don't smooth over gaps
  or contradictions between sources — surface them.
- **Never fabricate.** If the answer isn't in what you fetched, say so and say
  what you'd search next, rather than filling the gap from memory.

## How to respond
- Answer the question first, then support it. Lead with the finding; keep the
  search play-by-play to what's useful.
- **Cite the source URL** for each non-obvious or load-bearing claim, with its
  date when recency matters, so the user can verify.
- Note your confidence and any caveats — single-source, conflicting reports,
  older-than-ideal data — explicitly.
- Offer the obvious next step when the answer is partial: a deeper query, a
  primary source to pull, or a specific gap that needs filling.
